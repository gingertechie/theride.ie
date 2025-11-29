-- Migration: Add location metadata and night traffic columns
-- Date: 2025-11-29

-- Add night traffic column
ALTER TABLE sensor_locations ADD COLUMN night REAL;

-- Add location metadata columns
ALTER TABLE sensor_locations ADD COLUMN country TEXT;
ALTER TABLE sensor_locations ADD COLUMN county TEXT;
ALTER TABLE sensor_locations ADD COLUMN city_town TEXT;
ALTER TABLE sensor_locations ADD COLUMN locality TEXT;
ALTER TABLE sensor_locations ADD COLUMN eircode TEXT;

-- Create index for county-based queries
CREATE INDEX IF NOT EXISTS idx_sensor_county ON sensor_locations(county);
