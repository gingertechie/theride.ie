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
    v85 REAL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
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
