-- Sensor Locations Table
-- Stores Telraam traffic sensor locations and traffic measurement data

CREATE TABLE IF NOT EXISTS sensor_locations (
    segment_id INTEGER PRIMARY KEY,
    last_data_package TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Europe/Brussels',
    date TEXT,
    period TEXT,
    uptime REAL,
    heavy REAL,
    car REAL,
    bike REAL,
    pedestrian REAL,
    night REAL,
    v85 REAL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    country TEXT,
    county TEXT,
    city_town TEXT,
    locality TEXT,
    eircode TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(period IN ('hourly', 'daily', 'monthly') OR period IS NULL)
);

-- Index for geospatial queries
CREATE INDEX IF NOT EXISTS idx_sensor_coordinates ON sensor_locations(latitude, longitude);

-- Index for last_data_package to find most recent updates
CREATE INDEX IF NOT EXISTS idx_last_data ON sensor_locations(last_data_package);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_sensor_date ON sensor_locations(date);

-- Index for period-based queries
CREATE INDEX IF NOT EXISTS idx_sensor_period ON sensor_locations(period);

-- Index for county-based queries
CREATE INDEX IF NOT EXISTS idx_sensor_county ON sensor_locations(county);

-- Hourly sensor data table - stores detailed hourly traffic counts
CREATE TABLE IF NOT EXISTS sensor_hourly_data (
    segment_id INTEGER NOT NULL,
    hour_timestamp TEXT NOT NULL,
    bike REAL NOT NULL DEFAULT 0,
    car REAL NOT NULL DEFAULT 0,
    heavy REAL NOT NULL DEFAULT 0,
    pedestrian REAL NOT NULL DEFAULT 0,
    v85 REAL,
    uptime REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (segment_id, hour_timestamp),
    FOREIGN KEY (segment_id) REFERENCES sensor_locations(segment_id) ON DELETE CASCADE
);

-- Index for time-range queries across all sensors (busiest hour, date monitoring)
CREATE INDEX IF NOT EXISTS idx_sensor_hourly_timestamp ON sensor_hourly_data(hour_timestamp);

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
