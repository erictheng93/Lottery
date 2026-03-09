import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { scrape, backfill } from './scraper';
import { getStats, parseRange } from './stats';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());

app.get('/api/health', async (c) => {
  const latest = await c.env.DB.prepare(
    'SELECT period_id, created_at FROM draw_results ORDER BY period_id DESC LIMIT 1'
  ).first<{ period_id: string; created_at: string }>();

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
    last_period: latest?.period_id ?? null,
    last_scrape_time: latest?.created_at ?? null,
    total_records: totalResult?.count ?? 0,
    scrape_success_rate_24h: rate,
  });
});

app.get('/api/stats', async (c) => {
  const range = parseRange(c.req.query('range'));
  const result = await getStats(c.env, range);
  return c.json(result);
});

app.get('/api/draws', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 30, 1), 100);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const date = c.req.query('date'); // YYYY-MM-DD or undefined

  let whereClause = '';
  const params: (string | number)[] = [];

  if (date) {
    whereClause = 'WHERE period_id LIKE ?';
    params.push(date.replace(/-/g, '') + '%');
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM draw_results ${whereClause}`
  )
    .bind(...params)
    .first<{ count: number }>();

  const total = countResult?.count ?? 0;

  const rows = await c.env.DB.prepare(
    `SELECT period_id, draw_time, num1, num2, num3, num4, num5, digits
     FROM draw_results ${whereClause}
     ORDER BY period_id DESC LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all<{
      period_id: string;
      draw_time: string;
      num1: number;
      num2: number;
      num3: number;
      num4: number;
      num5: number;
      digits: string;
    }>();

  const draws = rows.results.map((r) => ({
    period_id: r.period_id,
    draw_time: r.draw_time,
    numbers: [r.num1, r.num2, r.num3, r.num4, r.num5],
    digits: r.digits.split(',').map(Number),
  }));

  return c.json({
    draws,
    total,
    has_more: offset + limit < total,
  });
});

app.get('/api/trigger-scrape', async (c) => {
  await scrape(c.env);
  return c.json({ triggered: true });
});

app.get('/api/trigger-backfill', async (c) => {
  const range = Number(c.req.query('range')) || 100;
  const clamped = Math.min(Math.max(range, 30), 100);
  const result = await backfill(c.env, clamped);
  return c.json(result);
});

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(scrape(env));
  },
};
