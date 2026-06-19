#!/usr/bin/env node
// Runs on GitHub Actions (non-Cloudflare IP) to dodge the source's bot management,
// which blocks the Worker's own egress. Fetches recent draws and POSTs the raw
// initlist to the Worker's /api/ingest, which parses + inserts into D1.
//
// Env: WORKER_URL, INGEST_TOKEN (required); SOURCE_BASE_URL, RANGE (optional).
// Zero dependencies — Node 18+ global fetch.

const SOURCE = process.env.SOURCE_BASE_URL ?? 'https://open-lat.inja777.com';
const WORKER = process.env.WORKER_URL;
const TOKEN = process.env.INGEST_TOKEN;
const RANGE = Number(process.env.RANGE) || 10;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ponytail: playkeys are server-side only (not exposed via /api/games) — keep in sync
// with packages/worker/src/types.ts GAMES.
const GAMES = [
  { id: 'wglhca', playkey: 'WNLHC' },
  { id: 'wglhcb', playkey: 'WN2LHC' },
  { id: 'wg539a', playkey: 'WNWSJLHC' },
  { id: 'wg539b', playkey: 'WN2WSJLHC' },
  { id: 'wg539c', playkey: 'WN3WSJLHC' },
];

if (!WORKER || !TOKEN) {
  console.error('Missing WORKER_URL or INGEST_TOKEN env');
  process.exit(2);
}

async function getCsrf() {
  const res = await fetch(`${SOURCE}/nowopen/${GAMES[0].playkey}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' },
  });
  const html = await res.text();
  const m = html.match(/id="_token"[^>]*value="([^"]+)"/);
  if (!m) throw new Error(`CSRF _token not found (status ${res.status})`);
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { token: m[1], cookie };
}

async function fetchInitlist(csrf, game) {
  const body = new URLSearchParams({
    playkey: game.playkey,
    page: 'nowopen',
    range: String(RANGE),
    date: '',
    type: 'range',
    _token: csrf.token,
  });
  const res = await fetch(`${SOURCE}/ajax_other_info`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrf.cookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`ajax_other_info ${res.status}`);
  const data = await res.json();
  return data.isData === '1' ? data.initlist : null;
}

async function ingest(gameId, initlist) {
  const res = await fetch(`${WORKER}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ game_id: gameId, initlist }),
  });
  if (!res.ok) throw new Error(`ingest ${res.status}: ${await res.text()}`);
  return res.json();
}

const csrf = await getCsrf();
let failures = 0;
for (const game of GAMES) {
  try {
    const initlist = await fetchInitlist(csrf, game);
    if (!initlist) {
      console.log(`${game.id}: no data`);
      continue;
    }
    const r = await ingest(game.id, initlist);
    console.log(`${game.id}: ${r.inserted} inserted, ${r.skipped} skipped, ${r.errors} errors`);
  } catch (e) {
    failures++;
    console.error(`${game.id}: ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);
