-- Migration: single-game → multi-game schema
-- Run this ONCE against existing local D1 to migrate data

CREATE TABLE draw_results_v2 (
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

CREATE INDEX idx_game_period ON draw_results_v2(game_id, period_id DESC);
CREATE INDEX idx_game_draw_time ON draw_results_v2(game_id, draw_time DESC);

INSERT INTO draw_results_v2 (game_id, period_id, draw_time, numbers, digits, raw_data, created_at)
SELECT 'wg539b', period_id, draw_time, json_array(num1, num2, num3, num4, num5), digits, raw_data, created_at
FROM draw_results;

DROP TABLE draw_results;
ALTER TABLE draw_results_v2 RENAME TO draw_results;

ALTER TABLE scrape_log ADD COLUMN game_id TEXT NOT NULL DEFAULT 'wg539b';
