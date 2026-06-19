import type { AppEnv } from './db';
import { DEFAULT_GAME_ID, GAMES, findGame } from './games';
import { ingestDraws, isAuthorizedBearer, type IngestPayload } from './ingest';
import { getStats, parseRange } from './stats';

interface DrawListRow {
  period_id: string;
  draw_time: string;
  numbers: string;
  digits: string;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function resolveGameId(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_GAME_ID;
  return findGame(raw)?.id ?? DEFAULT_GAME_ID;
}

export function handleGames(): Response {
  return json(GAMES.map((game) => ({
    id: game.id,
    name: game.name,
    numCount: game.numCount,
  })));
}

export async function handleHealth(env: AppEnv): Promise<Response> {
  const latest = await env.DB.prepare(
    'SELECT game_id, period_id, created_at FROM draw_results ORDER BY created_at DESC LIMIT 1'
  ).first<{ game_id: string; period_id: string; created_at: string }>();

  const totalResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM draw_results'
  ).first<{ count: number }>();

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const successRate = await env.DB.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes
     FROM scrape_log WHERE created_at >= ?`
  )
    .bind(dayAgo)
    .first<{ total: number; successes: number }>();

  const rate =
    successRate && successRate.total > 0
      ? `${((successRate.successes / successRate.total) * 100).toFixed(1)}%`
      : 'N/A';

  return json({
    status: 'ok',
    games_count: GAMES.length,
    last_game: latest?.game_id ?? null,
    last_period: latest?.period_id ?? null,
    last_scrape_time: latest?.created_at ?? null,
    total_records: totalResult?.count ?? 0,
    scrape_success_rate_24h: rate,
  });
}

export async function handleStats(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const gameId = resolveGameId(url.searchParams.get('game'));
  const range = parseRange(url.searchParams.get('range'));
  return json(await getStats(env, gameId, range));
}

export async function handleDraws(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const gameId = resolveGameId(url.searchParams.get('game'));
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const date = url.searchParams.get('date');

  let whereClause = 'WHERE game_id = ?';
  const params: Array<string | number> = [gameId];

  if (date) {
    whereClause += ' AND period_id LIKE ?';
    params.push(`${date.replace(/-/g, '')}%`);
  }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM draw_results ${whereClause}`
  )
    .bind(...params)
    .first<{ count: number }>();

  const total = countResult?.count ?? 0;
  const rows = await env.DB.prepare(
    `SELECT period_id, draw_time, numbers, digits
     FROM draw_results ${whereClause}
     ORDER BY period_id DESC LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all<DrawListRow>();

  return json({
    draws: rows.results.map((row) => ({
      period_id: row.period_id,
      draw_time: row.draw_time,
      numbers: JSON.parse(row.numbers) as number[],
      digits: row.digits.split(',').map(Number),
    })),
    total,
    has_more: offset + limit < total,
  });
}

export async function handleIngest(request: Request, env: AppEnv): Promise<Response> {
  if (!isAuthorizedBearer(request.headers.get('Authorization'), env.INGEST_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !Array.isArray((body as IngestPayload).draws)) {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    return json(await ingestDraws(env, body as IngestPayload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 400);
  }
}
