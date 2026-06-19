import { Hono } from 'hono';
import { GAMES, DEFAULT_GAME_ID, findGame, type Env, type InitListItem } from './types';
import { scrapeAll, backfill, insertDraws } from './scraper';
import { getStats, parseRange } from './stats';

// ponytail: SPA + API served from one Worker (same origin) → no CORS needed
const app = new Hono<{ Bindings: Env }>();

function resolveGameId(raw: string | undefined): string {
  if (!raw) return DEFAULT_GAME_ID;
  const game = findGame(raw);
  return game ? game.id : DEFAULT_GAME_ID;
}

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

// Ingest — CI (GitHub Actions, non-Cloudflare IP) fetches the source and POSTs the raw
// initlist here; the source's bot management blocks the Worker's own egress, so the
// scrape must originate off-Workers. Bearer-token protected.
app.post('/api/ingest', async (c) => {
  const token = c.env.INGEST_TOKEN;
  if (!token || c.req.header('Authorization') !== `Bearer ${token}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ game_id: string; initlist: string }>().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

  const game = findGame(body.game_id);
  if (!game) return c.json({ error: `Unknown game: ${body.game_id}` }, 400);

  let items: InitListItem[];
  try {
    items = JSON.parse(body.initlist);
  } catch {
    return c.json({ error: 'initlist is not valid JSON' }, 400);
  }

  const result = await insertDraws(c.env, game.id, items);
  return c.json(result);
});

// Dev-only endpoints — blocked in production via ENVIRONMENT env var
app.use('/api/trigger-*', async (c, next) => {
  if (c.env.ENVIRONMENT !== 'dev') {
    return c.json({ error: 'Not available in production' }, 403);
  }
  await next();
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
