/**
 * Database utility functions for Telraam sensor data
 */

/**
 * Get all sensor locations
 */
export async function getAllSensors(db: D1Database): Promise<SensorLocation[]> {
  const { results } = await db
    .prepare('SELECT * FROM sensor_locations ORDER BY segment_id')
    .all<SensorLocation>();

  return results || [];
}

/**
 * Get a single sensor by segment ID
 */
export async function getSensorById(
  db: D1Database,
  segmentId: number
): Promise<SensorLocation | null> {
  return await db
    .prepare('SELECT * FROM sensor_locations WHERE segment_id = ?')
    .bind(segmentId)
    .first<SensorLocation>();
}

/**
 * Get sensors within a geographic bounding box
 */
export async function getSensorsInBounds(
  db: D1Database,
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number
): Promise<SensorLocation[]> {
  const { results } = await db
    .prepare(`
      SELECT * FROM sensor_locations
      WHERE latitude BETWEEN ? AND ?
      AND longitude BETWEEN ? AND ?
      ORDER BY segment_id
    `)
    .bind(minLat, maxLat, minLon, maxLon)
    .all<SensorLocation>();

  return results || [];
}

/**
 * Get sensors by measurement period
 */
export async function getSensorsByPeriod(
  db: D1Database,
  period: 'hourly' | 'daily' | 'monthly'
): Promise<SensorLocation[]> {
  const { results } = await db
    .prepare('SELECT * FROM sensor_locations WHERE period = ? ORDER BY date DESC')
    .bind(period)
    .all<SensorLocation>();

  return results || [];
}

/**
 * Get sensors with data from a specific date
 */
export async function getSensorsByDate(
  db: D1Database,
  date: string
): Promise<SensorLocation[]> {
  const { results } = await db
    .prepare('SELECT * FROM sensor_locations WHERE date = ? ORDER BY segment_id')
    .bind(date)
    .all<SensorLocation>();

  return results || [];
}

/**
 * Insert or update a sensor location
 */
export async function upsertSensor(
  db: D1Database,
  sensor: Omit<SensorLocation, 'created_at' | 'updated_at'>
): Promise<D1Result> {
  return await db
    .prepare(`
      INSERT INTO sensor_locations (
        segment_id, last_data_package, timezone, date, period,
        uptime, heavy, car, bike, pedestrian, v85, latitude, longitude
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        updated_at = datetime('now')
    `)
    .bind(
      sensor.segment_id,
      sensor.last_data_package,
      sensor.timezone,
      sensor.date,
      sensor.period,
      sensor.uptime,
      sensor.heavy,
      sensor.car,
      sensor.bike,
      sensor.pedestrian,
      sensor.v85,
      sensor.latitude,
      sensor.longitude
    )
    .run();
}

/**
 * Get traffic statistics for a sensor
 */
export interface TrafficStats {
  total_vehicles: number;
  total_pedestrians: number;
  avg_speed: number;
  avg_uptime: number;
}

export async function getSensorStats(
  db: D1Database,
  segmentId: number
): Promise<TrafficStats | null> {
  const result = await db
    .prepare(`
      SELECT
        COALESCE(heavy, 0) + COALESCE(car, 0) + COALESCE(bike, 0) as total_vehicles,
        COALESCE(pedestrian, 0) as total_pedestrians,
        COALESCE(v85, 0) as avg_speed,
        COALESCE(uptime, 0) as avg_uptime
      FROM sensor_locations
      WHERE segment_id = ?
    `)
    .bind(segmentId)
    .first<TrafficStats>();

  return result;
}

/**
 * Delete a sensor location
 */
export async function deleteSensor(
  db: D1Database,
  segmentId: number
): Promise<D1Result> {
  return await db
    .prepare('DELETE FROM sensor_locations WHERE segment_id = ?')
    .bind(segmentId)
    .run();
}

/**
 * Get national cycling statistics
 */
export interface NationalStats {
  total_bikes: number;
  total_cars: number;
  total_pedestrians: number;
  total_heavy: number;
  sensor_count: number;
  last_updated: string;
}

export async function getNationalStats(db: D1Database): Promise<NationalStats | null> {
  const result = await db
    .prepare(`
      SELECT
        COALESCE(SUM(bike), 0) as total_bikes,
        COALESCE(SUM(car), 0) as total_cars,
        COALESCE(SUM(pedestrian), 0) as total_pedestrians,
        COALESCE(SUM(heavy), 0) as total_heavy,
        COUNT(*) as sensor_count,
        MAX(last_data_package) as last_updated
      FROM sensor_locations
      WHERE county IS NOT NULL
    `)
    .first<NationalStats>();

  return result;
}
