-- Migration: Add sensor R135 in Meath
-- Sensor 9000009735 was previously excluded due to NaT date in original snapshot
-- but now has valid data from Telraam API as of 2025-12-01

INSERT INTO sensor_locations (
  segment_id,
  last_data_package,
  timezone,
  latitude,
  longitude,
  country,
  county,
  city_town,
  locality,
  created_at,
  updated_at
) VALUES (
  9000009735,
  '2025-12-01 13:30:17.816300+00:00',
  'Europe/Dublin',
  53.5170017,
  -6.406897802,
  'Ireland',
  'County Meath',
  'Dublin',
  'Ashbourne',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(segment_id) DO UPDATE SET
  last_data_package = excluded.last_data_package,
  timezone = excluded.timezone,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  country = excluded.country,
  county = excluded.county,
  city_town = excluded.city_town,
  locality = excluded.locality,
  updated_at = datetime('now');
