CREATE TABLE IF NOT EXISTS draw_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    period_id TEXT NOT NULL,
    draw_time DATETIME NOT NULL,
    numbers TEXT NOT NULL,
    digits TEXT NOT NULL,
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_game_period ON draw_results(game_id, period_id DESC);
CREATE INDEX IF NOT EXISTS idx_game_draw_time ON draw_results(game_id, draw_time DESC);

CREATE TABLE IF NOT EXISTS stats_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

CREATE TABLE IF NOT EXISTS scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL DEFAULT 'wg539b',
    status TEXT NOT NULL,
    period_id TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
