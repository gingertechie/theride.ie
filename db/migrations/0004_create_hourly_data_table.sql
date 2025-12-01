-- Migration: Create hourly sensor data table
-- Stores hourly traffic counts from Telraam API
-- This replaces the snapshot approach with historical hourly data

CREATE TABLE IF NOT EXISTS sensor_hourly_data (
    segment_id INTEGER NOT NULL,
    hour_timestamp TEXT NOT NULL, -- DATETIME in ISO8601: '2025-11-30 14:00:00Z'
    bike REAL NOT NULL DEFAULT 0,
    car REAL NOT NULL DEFAULT 0,
    heavy REAL NOT NULL DEFAULT 0,
    pedestrian REAL NOT NULL DEFAULT 0,
    v85 REAL, -- 85th percentile speed in km/h
    uptime REAL, -- 0-1 percentage of hour with valid data
    created_at TEXT NOT NULL DEFAULT (datetime('now')), -- DATETIME in ISO8601
    PRIMARY KEY (segment_id, hour_timestamp), -- Ensures uniqueness: one record per sensor per hour
    FOREIGN KEY (segment_id) REFERENCES sensor_locations(segment_id) ON DELETE CASCADE
);

-- Index for time-based queries (e.g., get last 24 hours)
CREATE INDEX IF NOT EXISTS idx_hourly_timestamp ON sensor_hourly_data(hour_timestamp);

-- Index for segment + time queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_hourly_segment_time ON sensor_hourly_data(segment_id, hour_timestamp);

-- Index for created_at to help with cleanup of old records
CREATE INDEX IF NOT EXISTS idx_hourly_created ON sensor_hourly_data(created_at);
