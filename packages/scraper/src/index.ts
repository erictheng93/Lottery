import { GAMES, type IngestPayload } from '@lottery/core';
import { buildIngestPayload, SourceClient } from './source';

interface ScraperConfig {
  sourceBaseUrl: string;
  ingestUrl: string;
  ingestSecret: string;
  range: number;
  intervalSeconds: number;
  fetchTimeoutMs: number;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readNumberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function loadConfig(): ScraperConfig {
  return {
    sourceBaseUrl: process.env.SOURCE_BASE_URL ?? 'https://open-lat.inja777.com',
    ingestUrl: readRequiredEnv('INGEST_URL'),
    ingestSecret: readRequiredEnv('INGEST_SECRET'),
    range: Math.min(Math.max(readNumberEnv('BACKFILL_RANGE', 5), 1), 100),
    intervalSeconds: readNumberEnv('SCRAPE_INTERVAL_SECONDS', 60),
    fetchTimeoutMs: readNumberEnv('FETCH_TIMEOUT_MS', 15_000),
  };
}

async function postIngest(config: ScraperConfig, payload: IngestPayload) {
  const res = await fetch(config.ingestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.ingestSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw new Error(`ingest returned ${res.status}: ${text}`);
  }
  return body;
}

async function runScrapeCycle(config: ScraperConfig): Promise<void> {
  const source = new SourceClient(config.sourceBaseUrl, config.fetchTimeoutMs);
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ event: 'cycle_start', started_at: startedAt }));

  for (const game of GAMES) {
    try {
      const items = await source.fetchHistory(game, config.range);
      const payload = buildIngestPayload(game, items);
      const result = await postIngest(config, payload);
      console.log(
        JSON.stringify({
          event: 'game_ingested',
          game_id: game.id,
          source_items: items.length,
          result,
        })
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'game_failed',
          game_id: game.id,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = loadConfig();
  const once = process.argv.includes('--once') || process.env.RUN_ONCE === '1';

  if (once) {
    await runScrapeCycle(config);
    return;
  }

  while (true) {
    const started = Date.now();
    await runScrapeCycle(config);
    const elapsed = Date.now() - started;
    await sleep(Math.max(config.intervalSeconds * 1000 - elapsed, 0));
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'fatal',
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
});
