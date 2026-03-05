import type { Env, AjaxInfoResponse, CsrfData } from './types';

const CSRF_KV_KEY = 'csrf_data';
const CSRF_TTL_SECONDS = 600; // 10 minutes

async function fetchCsrfFromSource(env: Env): Promise<CsrfData> {
  const url = `${env.SOURCE_BASE_URL}/nowopen/${env.PLAYKEY}`;
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

async function fetchLatestDraw(
  env: Env,
  csrf: CsrfData
): Promise<AjaxInfoResponse> {
  const url = `${env.SOURCE_BASE_URL}/ajax_info`;
  const body = new URLSearchParams({
    playkey: env.PLAYKEY,
    ptype: env.PTYPE,
    _token: csrf.token,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrf.cookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });

  if (res.status === 419) {
    throw new Error('CSRF_EXPIRED');
  }
  if (!res.ok) {
    throw new Error(`ajax_info returned ${res.status}`);
  }

  return res.json();
}

async function writeScrapeLog(
  env: Env,
  status: string,
  periodId: string | null,
  message: string | null
) {
  await env.DB.prepare(
    'INSERT INTO scrape_log (status, period_id, message) VALUES (?, ?, ?)'
  )
    .bind(status, periodId, message)
    .run();
}

export async function scrape(env: Env): Promise<void> {
  let csrf: CsrfData;
  try {
    csrf = await getCsrfToken(env);
  } catch (e) {
    await writeScrapeLog(env, 'error', null, `CSRF fetch failed: ${e}`);
    return;
  }

  let data: AjaxInfoResponse;
  try {
    data = await fetchLatestDraw(env, csrf);
  } catch (e) {
    if (e instanceof Error && e.message === 'CSRF_EXPIRED') {
      // Retry once with fresh token
      try {
        csrf = await refreshCsrfToken(env);
        data = await fetchLatestDraw(env, csrf);
      } catch (retryErr) {
        await writeScrapeLog(
          env,
          'error',
          null,
          `Retry after CSRF refresh failed: ${retryErr}`
        );
        return;
      }
    } else {
      await writeScrapeLog(env, 'error', null, `ajax_info failed: ${e}`);
      return;
    }
  }

  const periodId = data!.nowPeriod;
  const numbers = data!.openlotNumber.map(Number);
  const digits = numbers.map((n) => n % 10);

  // Check if already exists
  const existing = await env.DB.prepare(
    'SELECT id FROM draw_results WHERE period_id = ?'
  )
    .bind(periodId)
    .first();

  if (existing) {
    await writeScrapeLog(env, 'skip', periodId, 'Already exists');
    return;
  }

  // Insert new draw result
  const drawTime = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO draw_results (period_id, draw_time, num1, num2, num3, num4, num5, digits, raw_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      periodId,
      drawTime,
      numbers[0],
      numbers[1],
      numbers[2],
      numbers[3],
      numbers[4],
      digits.join(','),
      JSON.stringify(data)
    )
    .run();

  await writeScrapeLog(env, 'success', periodId, null);
}
