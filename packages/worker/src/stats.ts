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
  last_seen_period: string | null;
}

interface PositionStats {
  position: number;
  details: DigitStats[]; // sorted by current_gap desc
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

/**
 * Compute per-position stats.
 * Each position (0-4 → num1-num5) is tracked independently.
 * For each position, only one digit appears per draw, so we track
 * frequency, current_gap, max_gap, last_seen_period for digits 0-9.
 */
function computeStats(draws: DrawRow[]): PositionStats[] {
  const positions: PositionStats[] = [];

  for (let pos = 0; pos < 5; pos++) {
    const frequency = new Array(10).fill(0);
    const currentGap = new Array(10).fill(-1);
    const maxGap = new Array(10).fill(0);
    const streak = new Array(10).fill(0);
    const lastSeenPeriod: (string | null)[] = new Array(10).fill(null);

    // draws[0] is most recent, iterate newest → oldest
    for (let i = 0; i < draws.length; i++) {
      const allDigits = draws[i].digits.split(',').map(Number);
      const d = allDigits[pos]; // single digit for this position

      frequency[d]++;

      // Update the seen digit
      if (currentGap[d] === -1) {
        currentGap[d] = i;
        lastSeenPeriod[d] = draws[i].period_id;
      }
      if (streak[d] > maxGap[d]) {
        maxGap[d] = streak[d];
      }
      streak[d] = 0;

      // Increment streak for all other digits
      for (let other = 0; other < 10; other++) {
        if (other !== d) {
          streak[other]++;
        }
      }
    }

    // Finalize
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

    // Sort by current_gap descending
    details.sort((a, b) => b.current_gap - a.current_gap);

    positions.push({ position: pos + 1, details });
  }

  return positions;
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
    'SELECT period_id, digits FROM draw_results ORDER BY period_id DESC LIMIT ?'
  )
    .bind(range)
    .all<DrawRow>();

  const rows = draws.results;
  const positions = computeStats(rows);

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
