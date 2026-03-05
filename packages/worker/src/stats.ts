import type { Env } from './types';

interface DrawRow {
  period_id: string;
  digits: string;
}

interface DigitStats {
  digit: number;
  frequency: number;
  current_gap: number;
  max_gap: number;
}

export interface StatsResult {
  summary: {
    most_omitted_digit: number;
    most_omitted_gap: number;
    total_periods: number;
  };
  details: DigitStats[];
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

function computeStats(draws: DrawRow[]): DigitStats[] {
  const frequency = new Array(10).fill(0);
  const currentGap = new Array(10).fill(-1); // -1 = not yet seen
  const maxGap = new Array(10).fill(0);
  const streak = new Array(10).fill(0); // running gap counter

  // draws[0] is the most recent, iterate from newest to oldest
  for (let i = 0; i < draws.length; i++) {
    const digits = draws[i].digits.split(',').map(Number);
    const seen = new Set<number>();

    for (const d of digits) {
      frequency[d]++;
      seen.add(d);
    }

    for (let d = 0; d < 10; d++) {
      if (seen.has(d)) {
        if (currentGap[d] === -1) {
          currentGap[d] = i; // periods since last appearance
        }
        if (streak[d] > maxGap[d]) {
          maxGap[d] = streak[d];
        }
        streak[d] = 0;
      } else {
        streak[d]++;
      }
    }
  }

  // Finalize: digits never seen have current_gap = total draws
  // Also check if the final streak is the max
  for (let d = 0; d < 10; d++) {
    if (currentGap[d] === -1) {
      currentGap[d] = draws.length;
    }
    if (streak[d] > maxGap[d]) {
      maxGap[d] = streak[d];
    }
  }

  const result: DigitStats[] = [];
  for (let d = 0; d < 10; d++) {
    result.push({
      digit: d,
      frequency: frequency[d],
      current_gap: currentGap[d],
      max_gap: maxGap[d],
    });
  }

  // Sort by current_gap descending
  result.sort((a, b) => b.current_gap - a.current_gap);
  return result;
}

export async function getStats(env: Env, range: number): Promise<StatsResult> {
  // 1. Check cache
  const cacheKey = `omission_${range}`;
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
    'SELECT period_id, digits FROM draw_results ORDER BY id DESC LIMIT ?'
  )
    .bind(range)
    .all<DrawRow>();

  const rows = draws.results;
  const details = computeStats(rows);
  const mostOmitted = details[0];

  const result: StatsResult = {
    summary: {
      most_omitted_digit: mostOmitted?.digit ?? 0,
      most_omitted_gap: mostOmitted?.current_gap ?? 0,
      total_periods: rows.length,
    },
    details,
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
