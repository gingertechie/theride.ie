-- Migration: Add indexes to sensor_hourly_data for query performance
-- Created: 2026-02-03
-- Purpose: Optimize range queries on hour_timestamp and composite queries

-- Index for timestamp range queries (used in all stats functions)
CREATE INDEX IF NOT EXISTS idx_hourly_timestamp
ON sensor_hourly_data(hour_timestamp);

-- Composite index for sensor-specific queries
-- Note: UNIQUE constraint already exists on (segment_id, hour_timestamp)
-- but we add explicit index for query optimization
CREATE INDEX IF NOT EXISTS idx_hourly_segment_time
ON sensor_hourly_data(segment_id, hour_timestamp);
