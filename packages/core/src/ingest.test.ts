import { describe, expect, test } from 'bun:test';
import { ingestDraws, isAuthorizedBearer } from './ingest';

class FakeRunStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string
  ) {}

  bind(...params: unknown[]) {
    return {
      run: async () => this.db.run(this.sql, params),
    };
  }
}

class FakeD1Database {
  drawRows: Array<{
    game_id: string;
    period_id: string;
    draw_time: string;
    numbers: string;
    digits: string;
    raw_data: string;
  }> = [];
  logRows: Array<{
    game_id: string;
    status: string;
    period_id: string | null;
    message: string | null;
  }> = [];

  prepare(sql: string) {
    return new FakeRunStatement(this, sql);
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes('INSERT OR IGNORE INTO draw_results')) {
      const [game_id, period_id, draw_time, numbers, digits, raw_data] =
        params as [string, string, string, string, string, string];
      const exists = this.drawRows.some(
        (row) => row.game_id === game_id && row.period_id === period_id
      );
      if (exists) {
        return { meta: { changes: 0 } };
      }
      this.drawRows.push({
        game_id,
        period_id,
        draw_time,
        numbers,
        digits,
        raw_data,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.includes('INSERT INTO scrape_log')) {
      const [game_id, status, period_id, message] = params as [
        string,
        string,
        string | null,
        string | null,
      ];
      this.logRows.push({ game_id, status, period_id, message });
      return { meta: { changes: 1 } };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

describe('isAuthorizedBearer', () => {
  test('accepts exact bearer token and rejects missing or mismatched values', () => {
    expect(isAuthorizedBearer('Bearer secret-value', 'secret-value')).toBe(true);
    expect(isAuthorizedBearer(null, 'secret-value')).toBe(false);
    expect(isAuthorizedBearer('Bearer wrong', 'secret-value')).toBe(false);
    expect(isAuthorizedBearer('secret-value', 'secret-value')).toBe(false);
    expect(isAuthorizedBearer('Bearer secret-value', undefined)).toBe(false);
  });
});

describe('ingestDraws', () => {
  test('inserts valid draws, computes digits, skips placeholders, and logs one summary row', async () => {
    const db = new FakeD1Database();

    const result = await ingestDraws(
      { DB: db },
      {
        game_id: 'wg539b',
        draws: [
          {
            period_id: '20260619001',
            draw_time: '2026-06-19T12:00:00',
            numbers: [1, 12, 23, 34, 45],
            raw_data: { source: 'test' },
          },
          {
            period_id: '',
            draw_time: '2026-06-19T12:01:00',
            numbers: [2, 13, 24, 35, 46],
          },
          {
            period_id: '20260619002',
            draw_time: '2026-06-19T12:02:00',
            numbers: [Number.NaN, 13, 24, 35, 46],
          },
        ],
      }
    );

    expect(result).toEqual({ inserted: 1, skipped: 2, errors: 0, total: 3 });
    expect(db.drawRows).toHaveLength(1);
    expect(db.drawRows[0]).toMatchObject({
      game_id: 'wg539b',
      period_id: '20260619001',
      draw_time: '2026-06-19T12:00:00',
      numbers: '[1,12,23,34,45]',
      digits: '1,2,3,4,5',
      raw_data: '{"source":"test"}',
    });
    expect(db.logRows).toEqual([
      {
        game_id: 'wg539b',
        status: 'success',
        period_id: null,
        message: 'Ingest: 1 inserted, 2 skipped, 0 errors',
      },
    ]);
  });

  test('treats duplicate draw inserts as skipped', async () => {
    const db = new FakeD1Database();
    const payload = {
      game_id: 'wg539b',
      draws: [
        {
          period_id: '20260619001',
          draw_time: '2026-06-19T12:00:00',
          numbers: [1, 2, 3, 4, 5],
        },
      ],
    };

    expect(await ingestDraws({ DB: db }, payload)).toMatchObject({
      inserted: 1,
      skipped: 0,
    });
    expect(await ingestDraws({ DB: db }, payload)).toMatchObject({
      inserted: 0,
      skipped: 1,
    });
    expect(db.drawRows).toHaveLength(1);
  });
});
