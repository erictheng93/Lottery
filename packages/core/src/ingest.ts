import type { AppEnv } from './db';
import { findGame } from './games';

export interface IngestDraw {
  period_id: string;
  draw_time: string;
  numbers: number[];
  raw_data?: unknown;
}

export interface IngestPayload {
  game_id: string;
  draws: IngestDraw[];
}

export interface IngestResult {
  inserted: number;
  skipped: number;
  errors: number;
  total: number;
}

export function isAuthorizedBearer(
  authorization: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!authorization || !secret) return false;
  const expected = `Bearer ${secret}`;
  if (authorization.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= authorization.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function isValidDraw(draw: IngestDraw, numCount: number): boolean {
  if (!draw.period_id || !draw.draw_time) return false;
  if (!Array.isArray(draw.numbers) || draw.numbers.length !== numCount) return false;
  return draw.numbers.every((value) => Number.isInteger(value) && value >= 0);
}

async function writeScrapeLog(
  env: AppEnv,
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

export async function ingestDraws(
  env: AppEnv,
  payload: IngestPayload
): Promise<IngestResult> {
  const game = findGame(payload.game_id);
  if (!game) {
    throw new Error(`Unknown game: ${payload.game_id}`);
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const draw of payload.draws) {
    if (!isValidDraw(draw, game.numCount)) {
      skipped++;
      continue;
    }

    const digits = draw.numbers.map((value) => value % 10);
    try {
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO draw_results (game_id, period_id, draw_time, numbers, digits, raw_data)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          game.id,
          draw.period_id,
          draw.draw_time,
          JSON.stringify(draw.numbers),
          digits.join(','),
          JSON.stringify(draw.raw_data ?? draw)
        )
        .run();

      if ((result.meta.changes ?? 0) > 0) {
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
    `Ingest: ${inserted} inserted, ${skipped} skipped, ${errors} errors`
  );

  return { inserted, skipped, errors, total: payload.draws.length };
}
