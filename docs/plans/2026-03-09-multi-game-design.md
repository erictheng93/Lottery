# Multi-Game Architecture Design

Date: 2026-03-09

## Context

The system currently supports a single game (WG視訊539 B). We need to support 5 games with the ability to add more in the future:

| Game | playkey | Numbers per draw |
|------|---------|-----------------|
| WG視訊六合彩 A | `WNLHC` | 7 (6 + special) |
| WG視訊六合彩 B | `WN2LHC` | 7 (6 + special) |
| WG視訊539 A | `WNWSJLHC` | 5 |
| WG視訊539 B | `WN2WSJLHC` | 5 |
| WG視訊539 C | `WN3WSJLHC` | 5 |

All games share the same source site (`open-lat.inja777.com`), same API endpoints (`ajax_info`, `ajax_other_info`), same `ptype` (`LHC`), and same CSRF mechanism.

## Decisions

### 1. Deployment: Single Worker + Single D1

All games run in one Worker instance with one D1 database. Rationale:
- Same source, same protocol — this is 1 system with 5 parameters, not 5 systems
- CSRF token is shared (same domain/session) — 1 fetch serves all games
- Data volume is trivial (~5 inserts/minute total)
- One deploy, one cron, one DB to manage

### 2. Number Storage: JSON Array

Replace `num1`–`num5` fixed columns with a single `numbers TEXT NOT NULL` column storing a JSON array (e.g., `[40,16,36,47,33,43,46]`).

Rationale:
- No existing query uses individual `numN` columns
- The draws API already reassembles them into an array
- Handles any number count without schema changes
- The `digits` column (for stats) remains separate

### 3. Game Config: Code Constants

Game definitions live in a TypeScript constant array, not in D1 or env vars.

```typescript
export interface GameConfig {
  id: string;        // e.g. "wg539b" — used in API params, DB game_id, cache keys
  playkey: string;   // e.g. "WN2WSJLHC" — sent to source API
  ptype: string;     // "LHC" for all current games
  name: string;      // display name, e.g. "WG視訊539 B"
  numCount: number;  // 5 for 539, 7 for 六合彩
}

export const GAMES: GameConfig[] = [
  { id: 'wglhca',  playkey: 'WNLHC',      ptype: 'LHC', name: 'WG視訊六合彩 A', numCount: 7 },
  { id: 'wglhcb',  playkey: 'WN2LHC',      ptype: 'LHC', name: 'WG視訊六合彩 B', numCount: 7 },
  { id: 'wg539a',  playkey: 'WNWSJLHC',    ptype: 'LHC', name: 'WG視訊539 A',    numCount: 5 },
  { id: 'wg539b',  playkey: 'WN2WSJLHC',   ptype: 'LHC', name: 'WG視訊539 B',    numCount: 5 },
  { id: 'wg539c',  playkey: 'WN3WSJLHC',   ptype: 'LHC', name: 'WG視訊539 C',    numCount: 5 },
];
```

Rationale:
- Adding a game requires code review + deploy — appropriate since validation is needed
- Full TypeScript type safety; shared source of truth for frontend and backend
- No admin UI overhead

### 4. Cron Strategy: Shared CSRF + Promise.allSettled

Each cron invocation (every 1 minute):

```
1. Fetch CSRF token/cookie (1 request)
   └─ If fails → log error, abort entire cron run

2. Promise.allSettled — parallel fetch all 5 games (15s timeout each)
   └─ fulfilled → write to DB
   └─ rejected → log error, skip to next cron

3. If any game returned 419 (CSRF expired):
   └─ Refresh CSRF token (1 request)
   └─ Promise.allSettled — retry ONLY the 419-failed games
   └─ fulfilled → write to DB
   └─ rejected → log error
```

Wall time: max ~15 seconds (parallel). Well within Workers limits. No cron overlap possible.

### 5. Stats: Uniform Per-Position Digit Logic

Same algorithm for all games: each position tracks ones digit (`n % 10`) frequency, current gap, and max gap. The only difference is the number of positions (5 for 539, 7 for 六合彩).

`computeStats()` reads `numCount` from the game config instead of hardcoding `5`.

### 6. API: Query Parameter with Backward Compatibility

All endpoints add an optional `game` parameter. If omitted, defaults to `wg539b` (current behavior).

```
GET /api/stats?game=wg539b&range=30
GET /api/draws?game=wglhca&limit=30&offset=0
GET /api/health                          (aggregated across all games)
GET /api/trigger-scrape                  (scrapes all games)
GET /api/trigger-backfill?game=wg539a&range=100
GET /api/games                           (returns game list for frontend dropdown)
```

New endpoint `GET /api/games` returns the `GAMES` array (id, name, numCount) for the frontend dropdown.

### 7. Frontend: Dropdown + Query String

- Dropdown selector in the header replaces the hardcoded `<h1>`
- Selected game stored in URL query string: `/?game=wg539b`
- Shareable links, browser back/forward works naturally
- `useStats` and `useDraws` composables accept `game` parameter
- Switching game resets pagination and re-fetches data

## DB Schema Changes

### Migration: `draw_results`

```sql
-- Add game_id column
ALTER TABLE draw_results ADD COLUMN game_id TEXT NOT NULL DEFAULT 'wg539b';

-- Add numbers JSON column
ALTER TABLE draw_results ADD COLUMN numbers TEXT NOT NULL DEFAULT '[]';

-- Backfill numbers from existing num1-num5
UPDATE draw_results SET numbers = json_array(num1, num2, num3, num4, num5);

-- Drop unique constraint on period_id (now unique per game)
-- D1 doesn't support DROP INDEX + re-create, so we need a new table:

CREATE TABLE draw_results_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    period_id TEXT NOT NULL,
    draw_time DATETIME NOT NULL,
    numbers TEXT NOT NULL,       -- JSON array, e.g. [40,16,36,47,33,43,46]
    digits TEXT NOT NULL,        -- comma-separated ones digits
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, period_id)
);

CREATE INDEX idx_game_period ON draw_results_v2(game_id, period_id DESC);
CREATE INDEX idx_game_draw_time ON draw_results_v2(game_id, draw_time DESC);

-- Migrate data
INSERT INTO draw_results_v2 (game_id, period_id, draw_time, numbers, digits, raw_data, created_at)
SELECT 'wg539b', period_id, draw_time, json_array(num1, num2, num3, num4, num5), digits, raw_data, created_at
FROM draw_results;

DROP TABLE draw_results;
ALTER TABLE draw_results_v2 RENAME TO draw_results;
```

### Migration: `stats_cache`

No schema change. Cache keys become `{game_id}_omission_{range}`, e.g. `wg539b_omission_100`.

### Migration: `scrape_log`

```sql
ALTER TABLE scrape_log ADD COLUMN game_id TEXT NOT NULL DEFAULT 'wg539b';
```

## Env Var Changes

Remove `PLAYKEY` and `PTYPE` from `wrangler.toml` — these are now in the code constants. Only `SOURCE_BASE_URL` remains as an env var (it's shared across all games).

```toml
[vars]
SOURCE_BASE_URL = "https://open-lat.inja777.com"
```

## File Changes Summary

### Worker (`packages/worker/src/`)

| File | Change |
|------|--------|
| `types.ts` | Add `GameConfig`, `GAMES` array. Remove `PLAYKEY`/`PTYPE` from `Env`. |
| `scraper.ts` | Accept `GameConfig` param. Shared CSRF logic. `scrapeAll()` with `Promise.allSettled` + 419 retry. |
| `stats.ts` | `computeStats()` uses `numCount` instead of hardcoded 5. Cache keys prefixed with `game_id`. |
| `index.ts` | All API routes accept `?game=` param. Add `GET /api/games`. `scheduled` calls `scrapeAll()`. |
| `db/schema.sql` | New schema with `game_id`, `numbers` JSON, composite unique. |
| `db/migrate-v2.sql` | Migration script for existing data. |

### Frontend (`packages/web/src/`)

| File | Change |
|------|--------|
| `api.ts` | All fetch functions accept `game` param. Add `fetchGames()`. |
| `composables/useStats.ts` | Accept `game` ref, re-fetch on change. |
| `composables/useDraws.ts` | Accept `game` ref, reset pagination on change. |
| `App.vue` | Add dropdown selector, read/write `?game=` query string. |
| `components/GameSelector.vue` | New component — dropdown for game selection. |
| `components/StatsBar.vue` | No change (receives data via props/composable). |
| `components/StatsPopover.vue` | Handle variable position count (5 or 7). |
| `components/DrawTable.vue` | Handle variable number count (5 or 7). |
| `components/OmissionCards.vue` | Handle variable position count. |
