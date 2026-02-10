-- Migration 0010: Add sensor quarantine flag
-- Date: 2026-02-10
-- Purpose: Flag sensors with suspect data to exclude from aggregates

-- Add quarantine flag column
ALTER TABLE sensor_locations
ADD COLUMN is_quarantined INTEGER DEFAULT 0;

-- Add index for efficient quarantine filtering
CREATE INDEX IF NOT EXISTS idx_sensor_quarantined
ON sensor_locations(is_quarantined);

-- Quarantine known problematic sensors
-- 9000009365: Pedestrianised area - 4,282% bike/car ratio
-- 9000001485: Pedestrianised area - 444% bike/car ratio (41k bikes)
UPDATE sensor_locations
SET is_quarantined = 1
WHERE segment_id IN (9000009365, 9000001485);
