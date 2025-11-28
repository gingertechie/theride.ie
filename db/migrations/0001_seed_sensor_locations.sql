-- Seed initial sensor location data

INSERT INTO sensor_locations (
    segment_id,
    last_data_package,
    timezone,
    date,
    period,
    uptime,
    heavy,
    car,
    bike,
    pedestrian,
    v85,
    latitude,
    longitude
)
VALUES (
    26408,
    '2021-01-16 13:01:52.564200+00:00',
    'Europe/Brussels',
    '2025-02-01',
    'hourly',
    0.98,
    104.2,
    2900.01,
    34.2,
    120.0,
    54.03,
    51.0355299980868,
    3.7072067896432
)
ON CONFLICT(segment_id) DO UPDATE SET
    last_data_package = excluded.last_data_package,
    timezone = excluded.timezone,
    date = excluded.date,
    period = excluded.period,
    uptime = excluded.uptime,
    heavy = excluded.heavy,
    car = excluded.car,
    bike = excluded.bike,
    pedestrian = excluded.pedestrian,
    v85 = excluded.v85,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    updated_at = datetime('now');
