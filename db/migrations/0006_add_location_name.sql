-- Migration: Add location_name column
-- Stores human-readable location names scraped from Telraam pages
-- Example: "Commons Road", "Main Street", etc.

ALTER TABLE sensor_locations ADD COLUMN location_name TEXT;

-- Create index for location name searches
CREATE INDEX IF NOT EXISTS idx_sensor_location_name ON sensor_locations(location_name);
