-- Weekly aggregated sensor statistics
-- Pre-computed aggregates for fast chart rendering
-- Updated weekly (Sunday) by aggregation worker

CREATE TABLE IF NOT EXISTS sensor_weekly_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_ending TEXT NOT NULL,  -- Date of Sunday (YYYY-MM-DD)
    segment_id INTEGER NOT NULL,
    county TEXT,                 -- Denormalized for fast county aggregations
    total_bikes INTEGER NOT NULL DEFAULT 0,
    avg_daily INTEGER,           -- Average bikes per day that week
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(week_ending, segment_id)
);

-- Index for fast lookups by county and week
CREATE INDEX IF NOT EXISTS idx_weekly_county_week ON sensor_weekly_stats(county, week_ending DESC);

-- Index for sensor-specific weekly trends
CREATE INDEX IF NOT EXISTS idx_weekly_segment ON sensor_weekly_stats(segment_id, week_ending DESC);

-- Index for cleanup (delete old weeks)
CREATE INDEX IF NOT EXISTS idx_weekly_date ON sensor_weekly_stats(week_ending);
