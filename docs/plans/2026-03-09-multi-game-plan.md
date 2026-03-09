# Multi-Game Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the lottery stats system from a single game (WG視訊539 B) to support 5 games (2 六合彩 + 3 539) with a shared Worker, shared D1, game selector dropdown, and URL-based game switching.

**Architecture:** Single Cloudflare Worker scrapes all games in parallel via shared CSRF + `Promise.allSettled`. Games are defined as TypeScript constants. API endpoints accept `?game=` query param. Frontend uses a dropdown with query string state.

**Tech Stack:** Cloudflare Workers, D1, KV, Hono, TypeScript, Vue 3 Composition API, Tailwind CSS

**Design doc:** `docs/plans/2026-03-09-multi-game-design.md`

---

### Task 1: Update DB Schema and Create Migration

**Files:**
- Modify: `packages/worker/src/db/schema.sql`
- Create: `packages/worker/src/db/migrate-v2.sql`

**Step 1: Update schema.sql to the new v2 schema**

Replace the entire content of `packages/worker/src/db/schema.sql` with:

```sql
CREATE TABLE IF NOT EXISTS draw_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    period_id TEXT NOT NULL,
    draw_time DATETIME NOT NULL,
    numbers TEXT NOT NULL,
    digits TEXT NOT NULL,
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_game_period ON draw_results(game_id, period_id DESC);
CREATE INDEX IF NOT EXISTS idx_game_draw_time ON draw_results(game_id, draw_time DESC);

CREATE TABLE IF NOT EXISTS stats_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

CREATE TABLE IF NOT EXISTS scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL DEFAULT 'wg539b',
    status TEXT NOT NULL,
    period_id TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Step 2: Create migration script for existing data**

Create `packages/worker/src/db/migrate-v2.sql`:

```sql
-- Migration: single-game → multi-game schema
-- Run this ONCE against existing local D1 to migrate data

CREATE TABLE draw_results_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    period_id TEXT NOT NULL,
    draw_time DATETIME NOT NULL,
    numbers TEXT NOT NULL,
    digits TEXT NOT NULL,
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, period_id)
);

CREATE INDEX idx_game_period ON draw_results_v2(game_id, period_id DESC);
CREATE INDEX idx_game_draw_time ON draw_results_v2(game_id, draw_time DESC);

INSERT INTO draw_results_v2 (game_id, period_id, draw_time, numbers, digits, raw_data, created_at)
SELECT 'wg539b', period_id, draw_time, json_array(num1, num2, num3, num4, num5), digits, raw_data, created_at
FROM draw_results;

DROP TABLE draw_results;
ALTER TABLE draw_results_v2 RENAME TO draw_results;

ALTER TABLE scrape_log ADD COLUMN game_id TEXT NOT NULL DEFAULT 'wg539b';
```

**Step 3: Add migration npm script and run it**

Add to `packages/worker/package.json` scripts:

```json
"db:migrate:local": "wrangler d1 execute lottery-db --local --file=src/db/migrate-v2.sql"
```

Run:

```bash
cd packages/worker && bun run db:migrate:local
```

Expected: Migration completes with no errors. Existing data now has `game_id='wg539b'` and `numbers` as JSON arrays.

**Step 4: Commit**

```bash
git add packages/worker/src/db/schema.sql packages/worker/src/db/migrate-v2.sql packages/worker/package.json
git commit -m "feat: update DB schema for multi-game support (v2 migration)"
```

---

### Task 2: Update Types and Game Config

**Files:**
- Modify: `packages/worker/src/types.ts`
- Modify: `packages/worker/wrangler.toml`

**Step 1: Rewrite types.ts with GameConfig and GAMES array**

Replace the entire content of `packages/worker/src/types.ts` with:

```typescript
export interface GameConfig {
  id: string;
  playkey: string;
  ptype: string;
  name: string;
  numCount: number;
}

export const GAMES: GameConfig[] = [
  { id: 'wglhca', playkey: 'WNLHC',     ptype: 'LHC', name: 'WG視訊六合彩 A', numCount: 7 },
  { id: 'wglhcb', playkey: 'WN2LHC',     ptype: 'LHC', name: 'WG視訊六合彩 B', numCount: 7 },
  { id: 'wg539a', playkey: 'WNWSJLHC',   ptype: 'LHC', name: 'WG視訊539 A',    numCount: 5 },
  { id: 'wg539b', playkey: 'WN2WSJLHC',  ptype: 'LHC', name: 'WG視訊539 B',    numCount: 5 },
  { id: 'wg539c', playkey: 'WN3WSJLHC',  ptype: 'LHC', name: 'WG視訊539 C',    numCount: 5 },
];

export const DEFAULT_GAME_ID = 'wg539b';

export function findGame(gameId: string): GameConfig | undefined {
  return GAMES.find((g) => g.id === gameId);
}

export interface Env {
  DB: D1Database;
  CSRF_CACHE: KVNamespace;
  SOURCE_BASE_URL: string;
}

export interface AjaxInfoResponse {
  lotname: string;
  nowPeriod: string;
  openlotNumber: string[];
  donePeriod: number;
  restPeriod: number;
  nextOpenlot: string;
  nextTime: number;
}

export interface CsrfData {
  token: string;
  cookie: string;
}

export interface InitListItem {
  preDrawCode: string[];
  preDrawIssue: string;
  preDrawTime: string;
}

export interface AjaxOtherInfoResponse {
  playkey: string;
  isData: string;
  ptype: string;
  initlist: string;
}
```

**Step 2: Update wrangler.toml — remove PLAYKEY and PTYPE**

Replace the `[vars]` section in `packages/worker/wrangler.toml` with:

```toml
[vars]
SOURCE_BASE_URL = "https://open-lat.inja777.com"
```

**Step 3: Commit**

```bash
git add packages/worker/src/types.ts packages/worker/wrangler.toml
git commit -m "feat: add GameConfig constants and remove single-game env vars"
```

---

### Task 3: Rewrite Scraper for Multi-Game

**Files:**
- Modify: `packages/worker/src/scraper.ts`

**Step 1: Rewrite scraper.ts**

Replace the entire content of `packages/worker/src/scraper.ts` with:

```typescript
import { GAMES, type Env, type GameConfig, type AjaxInfoResponse, type AjaxOtherInfoResponse, type InitListItem, type CsrfData } from './types';

const CSRF_KV_KEY = 'csrf_data';
const CSRF_TTL_SECONDS = 600;
const FETCH_TIMEOUT_MS = 15_000;

// --- CSRF Management ---

async function fetchCsrfFromSource(env: Env): Promise<CsrfData> {
  // Use first game's page to get CSRF — all games share same domain/session
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
  const periodId = data.nowPeriod;
  const numbers = data.openlotNumber.map(Number);
  const digits = numbers.map((n) => n % 10);

  // Check if already exists
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

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const r = result.value;
      await writeScrapeLog(env, r.game.id, r.status, r.periodId, r.message);
      if (r.status === 'csrf_expired') {
        csrfExpiredGames.push(r.game);
      }
    } else {
      // Promise rejected (timeout, network error, etc.)
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      // We don't know which game failed from a rejected promise,
      // but allSettled preserves order — use index
      const gameIndex = results.indexOf(result);
      const game = GAMES[gameIndex];
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

    for (const result of retryResults) {
      if (result.status === 'fulfilled') {
        const r = result.value;
        await writeScrapeLog(env, r.game.id, r.status, r.periodId, r.message);
      } else {
        const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        const gameIndex = retryResults.indexOf(result);
        const game = csrfExpiredGames[gameIndex];
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
    const periodId = item.preDrawIssue;
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
```

**Step 2: Verify TypeScript compiles**

Run:

```bash
cd packages/worker && npx tsc --noEmit
```

Expected: No errors (or only errors from `index.ts` / `stats.ts` which we haven't updated yet — that's OK for now).

**Step 3: Commit**

```bash
git add packages/worker/src/scraper.ts
git commit -m "feat: rewrite scraper for multi-game with shared CSRF and Promise.allSettled"
```

---

### Task 4: Update Stats for Dynamic Position Count

**Files:**
- Modify: `packages/worker/src/stats.ts`

**Step 1: Rewrite stats.ts to accept game_id and numCount**

Replace the entire content of `packages/worker/src/stats.ts` with:

```typescript
import { findGame, DEFAULT_GAME_ID, type Env } from './types';

interface DrawRow {
  period_id: string;
  digits: string;
}

interface DigitStats {
  digit: number;
  frequency: number;
  current_gap: number;
  max_gap: number;
  last_seen_period: string | null;
}

interface PositionStats {
  position: number;
  details: DigitStats[];
}

export interface StatsResult {
  positions: PositionStats[];
  total_periods: number;
  latest_period: string | null;
  last_update: string;
}

const VALID_RANGES = [30, 60, 100] as const;
const CACHE_TTL_SECONDS = 60;

export function parseRange(raw: string | undefined): number {
  const n = Number(raw);
  if (VALID_RANGES.includes(n as (typeof VALID_RANGES)[number])) return n;
  return 100;
}

function computeStats(draws: DrawRow[], numCount: number): PositionStats[] {
  const positions: PositionStats[] = [];

  for (let pos = 0; pos < numCount; pos++) {
    const frequency = new Array(10).fill(0);
    const currentGap = new Array(10).fill(-1);
    const maxGap = new Array(10).fill(0);
    const streak = new Array(10).fill(0);
    const lastSeenPeriod: (string | null)[] = new Array(10).fill(null);

    for (let i = 0; i < draws.length; i++) {
      const allDigits = draws[i].digits.split(',').map(Number);
      const d = allDigits[pos];

      frequency[d]++;

      if (currentGap[d] === -1) {
        currentGap[d] = i;
        lastSeenPeriod[d] = draws[i].period_id;
      }
      if (streak[d] > maxGap[d]) {
        maxGap[d] = streak[d];
      }
      streak[d] = 0;

      for (let other = 0; other < 10; other++) {
        if (other !== d) {
          streak[other]++;
        }
      }
    }

    const details: DigitStats[] = [];
    for (let d = 0; d < 10; d++) {
      if (currentGap[d] === -1) {
        currentGap[d] = draws.length;
      }
      if (streak[d] > maxGap[d]) {
        maxGap[d] = streak[d];
      }
      details.push({
        digit: d,
        frequency: frequency[d],
        current_gap: currentGap[d],
        max_gap: maxGap[d],
        last_seen_period: lastSeenPeriod[d],
      });
    }

    details.sort((a, b) => b.current_gap - a.current_gap);
    positions.push({ position: pos + 1, details });
  }

  return positions;
}

export async function getStats(env: Env, gameId: string, range: number): Promise<StatsResult> {
  const game = findGame(gameId);
  const numCount = game?.numCount ?? 5;

  // 1. Check cache
  const cacheKey = `${gameId}_omission_${range}`;
  const cached = await env.DB.prepare(
    'SELECT value, expires_at FROM stats_cache WHERE key = ?'
  )
    .bind(cacheKey)
    .first<{ value: string; expires_at: string }>();

  if (cached && new Date(cached.expires_at) > new Date()) {
    return JSON.parse(cached.value);
  }

  // 2. Compute fresh
  const draws = await env.DB.prepare(
    'SELECT period_id, digits FROM draw_results WHERE game_id = ? ORDER BY period_id DESC LIMIT ?'
  )
    .bind(gameId, range)
    .all<DrawRow>();

  const rows = draws.results;
  const positions = computeStats(rows, numCount);

  const result: StatsResult = {
    positions,
    total_periods: rows.length,
    latest_period: rows.length > 0 ? rows[0].period_id : null,
    last_update: new Date().toISOString(),
  };

  // 3. Write cache
  const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO stats_cache (key, value, updated_at, expires_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at`
  )
    .bind(cacheKey, JSON.stringify(result), expiresAt)
    .run();

  return result;
}
```

**Step 2: Commit**

```bash
git add packages/worker/src/stats.ts
git commit -m "feat: update stats to support dynamic position count per game"
```

---

### Task 5: Update API Routes

**Files:**
- Modify: `packages/worker/src/index.ts`

**Step 1: Rewrite index.ts with game param support and /api/games endpoint**

Replace the entire content of `packages/worker/src/index.ts` with:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GAMES, DEFAULT_GAME_ID, findGame, type Env } from './types';
import { scrapeAll, backfill } from './scraper';
import { getStats, parseRange } from './stats';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());

// --- Helper: resolve game_id from query param ---

function resolveGameId(raw: string | undefined): string {
  if (!raw) return DEFAULT_GAME_ID;
  const game = findGame(raw);
  return game ? game.id : DEFAULT_GAME_ID;
}

// --- Routes ---

app.get('/api/games', (c) => {
  return c.json(
    GAMES.map((g) => ({ id: g.id, name: g.name, numCount: g.numCount }))
  );
});

app.get('/api/health', async (c) => {
  const latest = await c.env.DB.prepare(
    'SELECT game_id, period_id, created_at FROM draw_results ORDER BY created_at DESC LIMIT 1'
  ).first<{ game_id: string; period_id: string; created_at: string }>();

  const totalResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM draw_results'
  ).first<{ count: number }>();

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const successRate = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes
     FROM scrape_log WHERE created_at >= ?`
  )
    .bind(dayAgo)
    .first<{ total: number; successes: number }>();

  const rate =
    successRate && successRate.total > 0
      ? ((successRate.successes / successRate.total) * 100).toFixed(1) + '%'
      : 'N/A';

  return c.json({
    status: 'ok',
    games_count: GAMES.length,
    last_game: latest?.game_id ?? null,
    last_period: latest?.period_id ?? null,
    last_scrape_time: latest?.created_at ?? null,
    total_records: totalResult?.count ?? 0,
    scrape_success_rate_24h: rate,
  });
});

app.get('/api/stats', async (c) => {
  const gameId = resolveGameId(c.req.query('game'));
  const range = parseRange(c.req.query('range'));
  const result = await getStats(c.env, gameId, range);
  return c.json(result);
});

app.get('/api/draws', async (c) => {
  const gameId = resolveGameId(c.req.query('game'));
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 30, 1), 100);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const date = c.req.query('date');

  let whereClause = 'WHERE game_id = ?';
  const params: (string | number)[] = [gameId];

  if (date) {
    whereClause += ' AND period_id LIKE ?';
    params.push(date.replace(/-/g, '') + '%');
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM draw_results ${whereClause}`
  )
    .bind(...params)
    .first<{ count: number }>();

  const total = countResult?.count ?? 0;

  const rows = await c.env.DB.prepare(
    `SELECT period_id, draw_time, numbers, digits
     FROM draw_results ${whereClause}
     ORDER BY period_id DESC LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all<{
      period_id: string;
      draw_time: string;
      numbers: string;
      digits: string;
    }>();

  const draws = rows.results.map((r) => ({
    period_id: r.period_id,
    draw_time: r.draw_time,
    numbers: JSON.parse(r.numbers) as number[],
    digits: r.digits.split(',').map(Number),
  }));

  return c.json({
    draws,
    total,
    has_more: offset + limit < total,
  });
});

app.get('/api/trigger-scrape', async (c) => {
  await scrapeAll(c.env);
  return c.json({ triggered: true, games: GAMES.length });
});

app.get('/api/trigger-backfill', async (c) => {
  const gameId = resolveGameId(c.req.query('game'));
  const game = findGame(gameId);
  if (!game) {
    return c.json({ error: `Unknown game: ${gameId}` }, 400);
  }
  const range = Number(c.req.query('range')) || 100;
  const clamped = Math.min(Math.max(range, 30), 100);
  const result = await backfill(c.env, game, clamped);
  return c.json(result);
});

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(scrapeAll(env));
  },
};
```

**Step 2: Verify full worker compiles**

Run:

```bash
cd packages/worker && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Start worker and test endpoints**

Run:

```bash
cd packages/worker && bun run dev
```

In another terminal, test:

```bash
curl http://localhost:8787/api/games
curl http://localhost:8787/api/stats?game=wg539b&range=30
curl http://localhost:8787/api/draws?game=wg539b&limit=5
curl http://localhost:8787/api/health
```

Expected: All return valid JSON. `/api/games` returns 5 games. Stats/draws return existing wg539b data.

**Step 4: Commit**

```bash
git add packages/worker/src/index.ts
git commit -m "feat: update API routes with game param and /api/games endpoint"
```

---

### Task 6: Update Frontend API Layer

**Files:**
- Modify: `packages/web/src/api.ts`

**Step 1: Add game param to all fetch functions and add fetchGames**

Replace the entire content of `packages/web/src/api.ts` with:

```typescript
const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GameInfo {
  id: string;
  name: string;
  numCount: number;
}

export interface DigitDetail {
  digit: number;
  frequency: number;
  current_gap: number;
  max_gap: number;
  last_seen_period: string | null;
}

export interface PositionStats {
  position: number;
  details: DigitDetail[];
}

export interface StatsResponse {
  positions: PositionStats[];
  total_periods: number;
  latest_period: string | null;
  last_update: string;
}

export interface Draw {
  period_id: string;
  draw_time: string;
  numbers: number[];
  digits: number[];
}

export interface DrawsResponse {
  draws: Draw[];
  total: number;
  has_more: boolean;
}

export async function fetchGames(): Promise<GameInfo[]> {
  const res = await fetch(`${BASE}/api/games`);
  if (!res.ok) throw new Error(`games: ${res.status}`);
  return res.json();
}

export async function fetchStats(game: string, range: number): Promise<StatsResponse> {
  const res = await fetch(`${BASE}/api/stats?game=${game}&range=${range}`);
  if (!res.ok) throw new Error(`stats: ${res.status}`);
  return res.json();
}

export async function fetchDraws(
  game: string,
  limit: number,
  offset: number,
  date?: string
): Promise<DrawsResponse> {
  let url = `${BASE}/api/draws?game=${game}&limit=${limit}&offset=${offset}`;
  if (date) url += `&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`draws: ${res.status}`);
  return res.json();
}
```

**Step 2: Commit**

```bash
git add packages/web/src/api.ts
git commit -m "feat: add game param to frontend API layer"
```

---

### Task 7: Update Composables for Game-Aware Polling

**Files:**
- Modify: `packages/web/src/composables/useStats.ts`
- Modify: `packages/web/src/composables/useDraws.ts`

**Step 1: Rewrite useStats.ts to accept game ref**

Replace the entire content of `packages/web/src/composables/useStats.ts` with:

```typescript
import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue';
import { fetchStats, type StatsResponse } from '@/api';

const POLL_INTERVAL = 30_000;

export function useStats(game: Ref<string>) {
  const range = ref(100);
  const data = ref<StatsResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fetchStats(game.value, range.value);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(load, POLL_INTERVAL);
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stopPolling();
    } else {
      load();
      startPolling();
    }
  }

  // Re-fetch when range or game changes
  watch([range, game], () => {
    data.value = null;
    load();
  });

  onMounted(() => {
    load();
    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onUnmounted(() => {
    stopPolling();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { range, data, loading, error };
}
```

**Step 2: Rewrite useDraws.ts to accept game ref**

Replace the entire content of `packages/web/src/composables/useDraws.ts` with:

```typescript
import { ref, watch, onMounted, type Ref } from 'vue';
import { fetchDraws, type DrawsResponse } from '@/api';

const PAGE_SIZE = 30;

export function useDraws(game: Ref<string>) {
  const draws = ref<DrawsResponse['draws']>([]);
  const total = ref(0);
  const hasMore = ref(false);
  const offset = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetchDraws(game.value, PAGE_SIZE, offset.value);
      draws.value = res.draws;
      total.value = res.total;
      hasMore.value = res.has_more;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function prevPage() {
    if (offset.value <= 0) return;
    offset.value = Math.max(0, offset.value - PAGE_SIZE);
    load();
  }

  function nextPage() {
    if (!hasMore.value) return;
    offset.value += PAGE_SIZE;
    load();
  }

  // Reset pagination and re-fetch when game changes
  watch(game, () => {
    offset.value = 0;
    draws.value = [];
    load();
  });

  onMounted(() => load());

  return { draws, total, hasMore, offset, loading, error, prevPage, nextPage, reload: load };
}
```

**Step 3: Commit**

```bash
git add packages/web/src/composables/useStats.ts packages/web/src/composables/useDraws.ts
git commit -m "feat: make composables game-aware with reactive game ref"
```

---

### Task 8: Create GameSelector Component and Update App.vue

**Files:**
- Create: `packages/web/src/components/GameSelector.vue`
- Modify: `packages/web/src/App.vue`

**Step 1: Create GameSelector.vue**

Create `packages/web/src/components/GameSelector.vue`:

```vue
<script setup lang="ts">
import type { GameInfo } from '@/api';

defineProps<{
  games: GameInfo[];
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <select
    :value="modelValue"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    class="bg-base-800 text-gray-200 text-sm font-bold rounded-lg border border-white/[0.08]
           px-3 py-1.5 pr-8 appearance-none cursor-pointer
           hover:border-accent/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30
           transition-all duration-200"
    style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239ca3af%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>'); background-repeat: no-repeat; background-position: right 8px center;"
  >
    <option
      v-for="g in games"
      :key="g.id"
      :value="g.id"
      class="bg-base-900 text-gray-200"
    >
      {{ g.name }}
    </option>
  </select>
</template>
```

**Step 2: Rewrite App.vue with game selector and query string state**

Replace the entire content of `packages/web/src/App.vue` with:

```vue
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { fetchGames, type GameInfo } from '@/api';
import GameSelector from '@/components/GameSelector.vue';
import StatsBar from '@/components/StatsBar.vue';
import OmissionCards from '@/components/OmissionCards.vue';
import DrawTable from '@/components/DrawTable.vue';

const DEFAULT_GAME = 'wg539b';

const games = ref<GameInfo[]>([]);
const currentGame = ref(DEFAULT_GAME);

// Read game from URL query string on load
function readGameFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('game') || DEFAULT_GAME;
}

// Write game to URL query string without reload
function writeGameToUrl(gameId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('game', gameId);
  window.history.replaceState({}, '', url.toString());
}

// Sync URL when game changes
watch(currentGame, (gameId) => {
  writeGameToUrl(gameId);
});

// Handle browser back/forward
window.addEventListener('popstate', () => {
  currentGame.value = readGameFromUrl();
});

onMounted(async () => {
  currentGame.value = readGameFromUrl();
  try {
    games.value = await fetchGames();
  } catch {
    // Fallback: use default game info
    games.value = [{ id: DEFAULT_GAME, name: 'WG視訊539 B', numCount: 5 }];
  }
});

const currentGameName = () => {
  const g = games.value.find((g) => g.id === currentGame.value);
  return g?.name ?? '';
};
</script>

<template>
  <div class="min-h-screen bg-base-950">
    <!-- Subtle gradient overlay -->
    <div class="fixed inset-0 pointer-events-none bg-gradient-to-b from-accent/[0.02] via-transparent to-transparent" />

    <div class="relative max-w-3xl mx-auto px-4 py-6 space-y-4">
      <!-- Header -->
      <header class="flex items-center gap-3 mb-2">
        <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
          </svg>
        </div>
        <div>
          <GameSelector
            v-if="games.length > 0"
            v-model="currentGame"
            :games="games"
          />
          <p class="text-xs text-gray-600 mt-0.5">即時開獎統計</p>
        </div>
      </header>

      <StatsBar :game="currentGame" />
      <OmissionCards :game="currentGame" />
      <DrawTable :game="currentGame" />
    </div>
  </div>
</template>
```

**Step 3: Commit**

```bash
git add packages/web/src/components/GameSelector.vue packages/web/src/App.vue
git commit -m "feat: add GameSelector dropdown with URL query string state"
```

---

### Task 9: Update Child Components to Accept Game Prop

**Files:**
- Modify: `packages/web/src/components/StatsBar.vue`
- Modify: `packages/web/src/components/OmissionCards.vue`
- Modify: `packages/web/src/components/DrawTable.vue`

These components now receive `game` as a prop and pass it to composables.

**Step 1: Rewrite StatsBar.vue**

Replace the entire content of `packages/web/src/components/StatsBar.vue` with:

```vue
<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useStats } from '@/composables/useStats';

const props = defineProps<{ game: string }>();
const { data, loading } = useStats(toRef(props, 'game'));

const topOmission = computed(() => {
  if (!data.value) return null;
  let best: { position: number; digit: number; gap: number } | null = null;
  for (const pos of data.value.positions) {
    const top = pos.details[0];
    if (top && (!best || top.current_gap > best.gap)) {
      best = { position: pos.position, digit: top.digit, gap: top.current_gap };
    }
  }
  return best;
});
</script>

<template>
  <div class="glass rounded-xl px-5 py-3.5 flex items-center gap-3">
    <span class="relative flex h-2.5 w-2.5 shrink-0">
      <span
        v-if="!loading"
        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/60"
      />
      <span class="relative inline-flex rounded-full h-2.5 w-2.5" :class="loading ? 'bg-gray-600' : 'bg-accent'" />
    </span>

    <template v-if="data && topOmission">
      <span class="text-sm text-gray-400">遺漏最大</span>
      <span class="text-sm text-gray-500">
        第{{ topOmission.position }}球
      </span>
      <span class="font-mono font-bold text-lg tabular-nums" :class="
        topOmission.gap >= 20
          ? 'text-gap-high'
          : topOmission.gap >= 10
            ? 'text-gap-mid'
            : 'text-accent'
      ">
        {{ topOmission.digit }}
      </span>
      <span class="text-sm text-gray-500">
        已
        <span class="font-mono font-semibold text-gray-300">{{ topOmission.gap }}</span>
        期未出現
      </span>
    </template>
    <template v-else-if="loading">
      <span class="text-sm text-gray-500">載入中...</span>
    </template>
  </div>
</template>
```

**Step 2: Rewrite OmissionCards.vue**

Replace the `<script setup>` section of `packages/web/src/components/OmissionCards.vue`. Change only the first 5 lines:

From:
```typescript
import { computed, ref } from 'vue';
import { useStats } from '@/composables/useStats';

const { data, loading } = useStats();
```

To:
```typescript
import { computed, ref, toRef } from 'vue';
import { useStats } from '@/composables/useStats';

const props = defineProps<{ game: string }>();
const { data, loading } = useStats(toRef(props, 'game'));
```

Also update the loading skeleton — change `v-for="i in 5"` to be dynamic. In the template, change:

```html
<div v-if="!data && loading" class="flex justify-center gap-3">
  <div
    v-for="i in 5"
    :key="i"
```

To:

```html
<div v-if="!data && loading" class="flex justify-center gap-3">
  <div
    v-for="i in 7"
    :key="i"
```

(Use 7 as max to cover both game types; extra skeletons won't be visible since the cards are flex-wrapped.)

**Step 3: Rewrite DrawTable.vue**

Replace the `<script setup>` section of `packages/web/src/components/DrawTable.vue`. Change the first line group:

From:
```typescript
import { useDraws } from '@/composables/useDraws';

const { draws, total, hasMore, offset, loading, prevPage, nextPage } = useDraws();
```

To:
```typescript
import { toRef } from 'vue';
import { useDraws } from '@/composables/useDraws';

const props = defineProps<{ game: string }>();
const { draws, total, hasMore, offset, loading, prevPage, nextPage } = useDraws(toRef(props, 'game'));
```

**Step 4: Verify frontend compiles**

Run:

```bash
cd packages/web && bun run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 5: Commit**

```bash
git add packages/web/src/components/StatsBar.vue packages/web/src/components/OmissionCards.vue packages/web/src/components/DrawTable.vue
git commit -m "feat: update child components to accept game prop"
```

---

### Task 10: Integration Test — Full Stack Manual Verification

**Step 1: Initialize fresh local DB**

```bash
cd packages/worker && bun run db:init:local
```

**Step 2: Start worker**

```bash
cd packages/worker && bun run dev
```

**Step 3: Backfill all 5 games**

In another terminal:

```bash
curl "http://localhost:8787/api/trigger-backfill?game=wg539b&range=100"
curl "http://localhost:8787/api/trigger-backfill?game=wg539a&range=100"
curl "http://localhost:8787/api/trigger-backfill?game=wg539c&range=100"
curl "http://localhost:8787/api/trigger-backfill?game=wglhca&range=100"
curl "http://localhost:8787/api/trigger-backfill?game=wglhcb&range=100"
```

Expected: Each returns `{ inserted: N, skipped: 0, errors: 0, total: N }` where N > 0.

**Step 4: Verify API responses**

```bash
curl "http://localhost:8787/api/games" | jq
curl "http://localhost:8787/api/stats?game=wglhca&range=30" | jq '.positions | length'
curl "http://localhost:8787/api/stats?game=wg539b&range=30" | jq '.positions | length'
curl "http://localhost:8787/api/draws?game=wglhca&limit=3" | jq '.draws[0].numbers | length'
```

Expected:
- `/api/games` returns 5 games
- Stats for wglhca returns 7 positions, wg539b returns 5 positions
- Draws for wglhca returns numbers array of length 7

**Step 5: Test trigger-scrape (all games)**

```bash
curl "http://localhost:8787/api/trigger-scrape"
```

Expected: `{ triggered: true, games: 5 }`

**Step 6: Start frontend and test**

```bash
cd packages/web && bun run dev
```

Open `http://localhost:5173/?game=wg539b` in browser:
- Verify dropdown shows all 5 games
- Switch to "WG視訊六合彩 A" — verify URL changes to `?game=wglhca`
- Verify draw table shows 7 numbers per row for 六合彩
- Verify OmissionCards shows 7 cards for 六合彩, 5 for 539
- Verify stats popover works for both game types

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: complete multi-game support with 5 games"
```
