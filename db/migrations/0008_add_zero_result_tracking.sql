-- Migration: Add zero-result tracking for exponential backoff
-- Purpose: Track when sensors return zero records to implement smart backoff
-- Date: 2026-02-06

-- Add timestamp tracking when sensor returns zero records
ALTER TABLE sensor_locations
ADD COLUMN last_zero_result_at TEXT;

-- Add attempt counter for backoff calculation
ALTER TABLE sensor_locations
ADD COLUMN consecutive_zero_count INTEGER NOT NULL DEFAULT 0;

-- Add status field for explicit sensor state tracking
ALTER TABLE sensor_locations
ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
CHECK(status IN ('active', 'monitoring', 'inactive'));

-- Index for efficient filtering in priority query
CREATE INDEX IF NOT EXISTS idx_sensor_last_zero
ON sensor_locations(last_zero_result_at);

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_sensor_status
ON sensor_locations(status);
