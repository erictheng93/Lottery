import { GAMES, type Env, type GameConfig, type AjaxInfoResponse, type AjaxOtherInfoResponse, type InitListItem, type CsrfData } from './types';

const CSRF_KV_KEY = 'csrf_data';
const CSRF_TTL_SECONDS = 600;
const FETCH_TIMEOUT_MS = 15_000;

// --- CSRF Management ---

async function fetchCsrfFromSource(env: Env): Promise<CsrfData> {
  const url = `${env.SOURCE_BASE_URL}/nowopen/${GAMES[0].playkey}`;
  const res = await fetch(url);
  const html = await res.text();

  const tokenMatch = html.match(/id="_token"[^>]*value="([^"]+)"/);
  if (!tokenMatch) {
    throw new Error('Failed to parse CSRF _token from HTML');
  }

  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookies = setCookie
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c.length > 0)
    .join('; ');

  return { token: tokenMatch[1], cookie: cookies };
}

async function getCsrfToken(env: Env): Promise<CsrfData> {
  const cached = await env.CSRF_CACHE.get(CSRF_KV_KEY, 'json');
  if (cached) {
    return cached as CsrfData;
  }
  return refreshCsrfToken(env);
}

async function refreshCsrfToken(env: Env): Promise<CsrfData> {
  const data = await fetchCsrfFromSource(env);
  await env.CSRF_CACHE.put(CSRF_KV_KEY, JSON.stringify(data), {
    expirationTtl: CSRF_TTL_SECONDS,
  });
  return data;
}

// --- Fetch with Timeout ---

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- Single Game Scrape ---

interface ScrapeGameResult {
  game: GameConfig;
  status: 'success' | 'skip' | 'csrf_expired' | 'error';
  periodId: string | null;
  message: string | null;
}

async function scrapeOneGame(env: Env, game: GameConfig, csrf: CsrfData): Promise<ScrapeGameResult> {
  const url = `${env.SOURCE_BASE_URL}/ajax_info`;
  const body = new URLSearchParams({
    playkey: game.playkey,
    ptype: game.ptype,
    _token: csrf.token,
  });

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: csrf.cookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    },
    FETCH_TIMEOUT_MS
  );

  if (res.status === 419) {
    return { game, status: 'csrf_expired', periodId: null, message: 'CSRF token expired (419)' };
  }
  if (!res.ok) {
    return { game, status: 'error', periodId: null, message: `ajax_info returned ${res.status}` };
  }

  const data: AjaxInfoResponse = await res.json();
  const periodId = data.nowPeriod.trim();

  // Upstream returns a sentinel payload ({nowPeriod:"", openlotNumber:[], donePeriod:999, ...})
  // for games that are offline or no longer exist. Skip without writing draw_results.
  if (!periodId || !Array.isArray(data.openlotNumber) || data.openlotNumber.length === 0) {
    return { game, status: 'skip', periodId: null, message: 'Empty payload (game offline)' };
  }

  const numbers = data.openlotNumber.map(Number);
  const digits = numbers.map((n) => n % 10);

  const existing = await env.DB.prepare(
    'SELECT id FROM draw_results WHERE game_id = ? AND period_id = ?'
  )
    .bind(game.id, periodId)
    .first();

  if (existing) {
    return { game, status: 'skip', periodId, message: 'Already exists' };
  }

  const drawTime = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO draw_results (game_id, period_id, draw_time, numbers, digits, raw_data)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      game.id,
      periodId,
      drawTime,
      JSON.stringify(numbers),
      digits.join(','),
      JSON.stringify(data)
    )
    .run();

  return { game, status: 'success', periodId, message: null };
}

// --- Write Log ---

async function writeScrapeLog(
  env: Env,
  gameId: string,
  status: string,
  periodId: string | null,
  message: string | null
) {
  await env.DB.prepare(
    'INSERT INTO scrape_log (game_id, status, period_id, message) VALUES (?, ?, ?, ?)'
  )
    .bind(gameId, status, periodId, message)
    .run();
}

// --- Main: Scrape All Games ---

export async function scrapeAll(env: Env): Promise<void> {
  // 1. Get CSRF token (shared across all games)
  let csrf: CsrfData;
  try {
    csrf = await getCsrfToken(env);
  } catch (e) {
    await writeScrapeLog(env, '*', 'error', null, `CSRF fetch failed: ${e}`);
    return;
  }

  // 2. Scrape all games in parallel with Promise.allSettled
  const results = await Promise.allSettled(
    GAMES.map((game) => scrapeOneGame(env, game, csrf))
  );

  // 3. Process results, collect 419 failures for retry
  const csrfExpiredGames: GameConfig[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      const r = result.value;
      await writeScrapeLog(env, r.game.id, r.status, r.periodId, r.message);
      if (r.status === 'csrf_expired') {
        csrfExpiredGames.push(r.game);
      }
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      const game = GAMES[i];
      await writeScrapeLog(env, game.id, 'error', null, `Fetch failed: ${errorMsg}`);
    }
  }

  // 4. If any games got 419, refresh CSRF and retry only those
  if (csrfExpiredGames.length > 0) {
    try {
      csrf = await refreshCsrfToken(env);
    } catch (e) {
      for (const game of csrfExpiredGames) {
        await writeScrapeLog(env, game.id, 'error', null, `CSRF refresh failed on retry: ${e}`);
      }
      return;
    }

    const retryResults = await Promise.allSettled(
      csrfExpiredGames.map((game) => scrapeOneGame(env, game, csrf))
    );

    for (let i = 0; i < retryResults.length; i++) {
      const result = retryResults[i];
      if (result.status === 'fulfilled') {
        const r = result.value;
        await writeScrapeLog(env, r.game.id, r.status, r.periodId, r.message);
      } else {
        const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        const game = csrfExpiredGames[i];
        await writeScrapeLog(env, game.id, 'error', null, `Retry failed: ${errorMsg}`);
      }
    }
  }
}

// --- Backfill (per-game) ---

export interface BackfillResult {
  inserted: number;
  skipped: number;
  errors: number;
  total: number;
}

export async function backfill(env: Env, game: GameConfig, range: number): Promise<BackfillResult> {
  let csrf: CsrfData;
  try {
    csrf = await getCsrfToken(env);
  } catch {
    csrf = await refreshCsrfToken(env);
  }

  const fetchHistory = async (c: CsrfData): Promise<AjaxOtherInfoResponse> => {
    const url = `${env.SOURCE_BASE_URL}/ajax_other_info`;
    const body = new URLSearchParams({
      playkey: game.playkey,
      page: 'nowopen',
      range: String(range),
      date: '',
      type: 'range',
      _token: c.token,
    });

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: c.cookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
      },
      FETCH_TIMEOUT_MS
    );

    if (res.status === 419) throw new Error('CSRF_EXPIRED');
    if (!res.ok) throw new Error(`ajax_other_info returned ${res.status}`);
    return res.json();
  };

  let raw: AjaxOtherInfoResponse;
  try {
    raw = await fetchHistory(csrf);
  } catch (e) {
    if (e instanceof Error && e.message === 'CSRF_EXPIRED') {
      csrf = await refreshCsrfToken(env);
      raw = await fetchHistory(csrf);
    } else {
      throw e;
    }
  }

  if (raw.isData !== '1') {
    return { inserted: 0, skipped: 0, errors: 0, total: 0 };
  }

  const items: InitListItem[] = JSON.parse(raw.initlist);
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of items) {
    const periodId = item.preDrawIssue.trim();
    if (!periodId || !Array.isArray(item.preDrawCode) || item.preDrawCode.length === 0) {
      skipped++;
      continue;
    }
    const numbers = item.preDrawCode.map(Number);
    const digits = numbers.map((n) => n % 10);
    const drawTime = item.preDrawTime.replace('<br>', 'T');

    try {
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO draw_results (game_id, period_id, draw_time, numbers, digits, raw_data)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          game.id,
          periodId,
          drawTime,
          JSON.stringify(numbers),
          digits.join(','),
          JSON.stringify(item)
        )
        .run();

      if (result.meta.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    } catch {
      errors++;
    }
  }

  await writeScrapeLog(
    env,
    game.id,
    'success',
    null,
    `Backfill range=${range}: ${inserted} inserted, ${skipped} skipped, ${errors} errors`
  );

  return { inserted, skipped, errors, total: items.length };
}
