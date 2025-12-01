-- Migration: Remove snapshot fields from sensor_locations
-- We're moving to hourly data storage, so snapshot fields are no longer needed
-- SQLite doesn't support DROP COLUMN easily, so we recreate the table

-- Create new table with only location metadata
CREATE TABLE sensor_locations_new (
    segment_id INTEGER PRIMARY KEY,
    last_data_package TEXT NOT NULL, -- Keep for tracking last API update
    timezone TEXT NOT NULL DEFAULT 'Europe/Brussels',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    country TEXT,
    county TEXT,
    city_town TEXT,
    locality TEXT,
    eircode TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copy data from old table (only the columns we're keeping)
INSERT INTO sensor_locations_new (
    segment_id,
    last_data_package,
    timezone,
    latitude,
    longitude,
    country,
    county,
    city_town,
    locality,
    eircode,
    created_at,
    updated_at
)
SELECT
    segment_id,
    last_data_package,
    timezone,
    latitude,
    longitude,
    country,
    county,
    city_town,
    locality,
    eircode,
    created_at,
    updated_at
FROM sensor_locations;

-- Drop old table
DROP TABLE sensor_locations;

-- Rename new table
ALTER TABLE sensor_locations_new RENAME TO sensor_locations;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_sensor_coordinates ON sensor_locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_last_data ON sensor_locations(last_data_package);
CREATE INDEX IF NOT EXISTS idx_sensor_county ON sensor_locations(county);
