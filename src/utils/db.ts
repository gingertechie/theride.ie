/**
 * Database utility functions for Telraam sensor data
 */
import { formatMidnight, formatDate, formatDateTime } from './date-formatting';

/**
 * Get yesterday's date range (midnight to midnight UTC)
 * Used for calculating "last complete day" statistics
 */
export function getYesterdayDateRange(): { start: string; end: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  const today = new Date(yesterday);
  today.setUTCDate(today.getUTCDate() + 1);

  return {
    start: formatMidnight(yesterday),
    end: formatMidnight(today),
  };
}

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
 * Insert or update a sensor location (metadata only, no traffic data)
 */
export async function upsertSensor(
  db: D1Database,
  sensor: Omit<SensorLocation, 'created_at' | 'updated_at'>
): Promise<D1Result> {
  return await db
    .prepare(`
      INSERT INTO sensor_locations (
        segment_id, last_data_package, timezone, latitude, longitude,
        country, county, city_town, locality, eircode
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(segment_id) DO UPDATE SET
        last_data_package = excluded.last_data_package,
        timezone = excluded.timezone,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        country = excluded.country,
        county = excluded.county,
        city_town = excluded.city_town,
        locality = excluded.locality,
        eircode = excluded.eircode,
        updated_at = datetime('now')
    `)
    .bind(
      sensor.segment_id,
      sensor.last_data_package,
      sensor.timezone,
      sensor.latitude,
      sensor.longitude,
      sensor.country ?? null,
      sensor.county ?? null,
      sensor.city_town ?? null,
      sensor.locality ?? null,
      sensor.eircode ?? null
    )
    .run();
}

/**
 * Get traffic statistics for a sensor (daily totals from hourly data)
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
  // Get yesterday's date range (last complete day)
  const yesterday = getYesterdayDateRange();

  const result = await db
    .prepare(`
      SELECT
        COALESCE(SUM(heavy), 0) + COALESCE(SUM(car), 0) + COALESCE(SUM(bike), 0) as total_vehicles,
        COALESCE(SUM(pedestrian), 0) as total_pedestrians,
        COALESCE(AVG(v85), 0) as avg_speed,
        COALESCE(AVG(uptime), 0) as avg_uptime
      FROM sensor_hourly_data
      WHERE segment_id = ?
        AND hour_timestamp >= ?
        AND hour_timestamp < ?
    `)
    .bind(segmentId, yesterday.start, yesterday.end)
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
 * Get national cycling statistics (daily totals from hourly data)
 */
export interface NationalStats {
  total_bikes: number;
  total_cars: number;
  total_pedestrians: number;
  total_heavy: number;
  sensor_count: number;
  last_updated: string;
  date_range: string; // Which day's data is shown
}

export async function getNationalStats(db: D1Database): Promise<NationalStats | null> {
  // Get yesterday's date range (last complete day)
  const yesterday = getYesterdayDateRange();

  const result = await db
    .prepare(`
      SELECT
        COALESCE(SUM(h.bike), 0) as total_bikes,
        COALESCE(SUM(h.car), 0) as total_cars,
        COALESCE(SUM(h.pedestrian), 0) as total_pedestrians,
        COALESCE(SUM(h.heavy), 0) as total_heavy,
        COUNT(DISTINCT h.segment_id) as sensor_count,
        MAX(h.hour_timestamp) as last_updated
      FROM sensor_hourly_data h
      INNER JOIN sensor_locations s ON h.segment_id = s.segment_id
      WHERE s.county IS NOT NULL
        AND (s.is_quarantined = 0 OR s.is_quarantined IS NULL)
        AND h.hour_timestamp >= ?
        AND h.hour_timestamp < ?
    `)
    .bind(yesterday.start, yesterday.end)
    .first<Omit<NationalStats, 'date_range'>>();

  if (!result) {
    return null;
  }

  return {
    ...result,
    date_range: yesterday.start.split(' ')[0], // Just the date part
  };
}

/**
 * Get top counties by bike count (daily totals from hourly data)
 */
export interface CountyStats {
  county: string;
  total_bikes: number;
  sensor_count: number;
  avg_bikes_per_sensor: number;
}

export async function getTopCountiesByBikes(
  db: D1Database,
  limit: number = 3
): Promise<CountyStats[]> {
  // Get yesterday's date range (last complete day)
  const yesterday = getYesterdayDateRange();

  const { results } = await db
    .prepare(`
      SELECT
        s.county,
        COALESCE(SUM(h.bike), 0) as total_bikes,
        COUNT(DISTINCT h.segment_id) as sensor_count,
        COALESCE(SUM(h.bike) * 1.0 / COUNT(DISTINCT h.segment_id), 0) as avg_bikes_per_sensor
      FROM sensor_hourly_data h
      INNER JOIN sensor_locations s ON h.segment_id = s.segment_id
      WHERE s.county IS NOT NULL
        AND (s.is_quarantined = 0 OR s.is_quarantined IS NULL)
        AND h.hour_timestamp >= ?
        AND h.hour_timestamp < ?
      GROUP BY s.county
      ORDER BY total_bikes DESC
      LIMIT ?
    `)
    .bind(yesterday.start, yesterday.end, limit)
    .all<CountyStats>();

  return results || [];
}

/**
 * Busiest sensor data (sensor with most bikes yesterday)
 */
export interface BusiestSensorData {
  segment_id: number;
  location_name: string | null;
  county: string;
  total_bikes: number;
}

/**
 * Get the busiest sensor (by bike count) for yesterday
 */
export async function getBusiestSensor(
  db: D1Database
): Promise<BusiestSensorData | null> {
  const yesterday = getYesterdayDateRange();

  const result = await db
    .prepare(`
      SELECT
        s.segment_id,
        s.location_name,
        s.county,
        COALESCE(SUM(h.bike), 0) as total_bikes
      FROM sensor_hourly_data h
      INNER JOIN sensor_locations s ON h.segment_id = s.segment_id
      WHERE h.hour_timestamp >= ?
        AND h.hour_timestamp < ?
        AND s.county IS NOT NULL
        AND (s.is_quarantined = 0 OR s.is_quarantined IS NULL)
      GROUP BY s.segment_id, s.location_name, s.county
      ORDER BY total_bikes DESC, s.segment_id ASC
      LIMIT 1
    `)
    .bind(yesterday.start, yesterday.end)
    .first<BusiestSensorData>();

  return result;
}

/**
 * Get detailed stats for a specific county (daily totals from hourly data)
 */
export interface SensorWithDailyTotal {
  segment_id: number;
  latitude: number;
  longitude: number;
  locality: string | null;
  city_town: string | null;
  county: string | null;
  location_name: string | null;
  bike: number;
  car: number;
  pedestrian: number;
  heavy: number;
}

export interface CountyDetails {
  county: string;
  total_bikes: number;
  sensor_count: number;
  avg_bikes_per_sensor: number;
  sensors: SensorWithDailyTotal[];
}

export async function getCountyDetails(
  db: D1Database,
  county: string
): Promise<CountyDetails | null> {
  // Get yesterday's date range (last complete day)
  const yesterday = getYesterdayDateRange();

  // Get county statistics
  const stats = await db
    .prepare(`
      SELECT
        s.county,
        COALESCE(SUM(h.bike), 0) as total_bikes,
        COUNT(DISTINCT h.segment_id) as sensor_count,
        COALESCE(SUM(h.bike) * 1.0 / COUNT(DISTINCT h.segment_id), 0) as avg_bikes_per_sensor
      FROM sensor_hourly_data h
      INNER JOIN sensor_locations s ON h.segment_id = s.segment_id
      WHERE s.county = ?
        AND h.hour_timestamp >= ?
        AND h.hour_timestamp < ?
      GROUP BY s.county
    `)
    .bind(county, yesterday.start, yesterday.end)
    .first<CountyStats>();

  if (!stats) {
    return null;
  }

  // Get all sensors for this county with their daily totals
  const { results: sensors } = await db
    .prepare(`
      SELECT
        s.segment_id,
        s.latitude,
        s.longitude,
        s.locality,
        s.city_town,
        s.county,
        s.location_name,
        COALESCE(SUM(h.bike), 0) as bike,
        COALESCE(SUM(h.car), 0) as car,
        COALESCE(SUM(h.pedestrian), 0) as pedestrian,
        COALESCE(SUM(h.heavy), 0) as heavy
      FROM sensor_locations s
      LEFT JOIN sensor_hourly_data h ON s.segment_id = h.segment_id
        AND h.hour_timestamp >= ?
        AND h.hour_timestamp < ?
      WHERE s.county = ?
      GROUP BY s.segment_id
      ORDER BY bike DESC, s.segment_id
    `)
    .bind(yesterday.start, yesterday.end, county)
    .all<SensorWithDailyTotal>();

  return {
    ...stats,
    sensors: sensors || [],
  };
}

/**
 * Get monitoring data for external health checks
 * Compares today vs yesterday record counts to detect worker failures
 */
export interface MonitoringData {
  timestamp: string; // When this check was run (ISO8601 UTC)
  today: {
    date: string; // YYYY-MM-DD
    record_count: number;
    sensor_count: number;
    earliest_record: string | null;
    latest_record: string | null;
  };
  yesterday: {
    date: string; // YYYY-MM-DD
    record_count: number;
    sensor_count: number;
    earliest_record: string | null;
    latest_record: string | null;
  };
  comparison: {
    count_change: number; // today - yesterday
    count_change_percent: number; // (today - yesterday) / yesterday * 100
    is_healthy: boolean; // true if today >= yesterday * 0.7 (70% threshold)
    threshold: number; // 0.7 = 70%
  };
  diagnostic: {
    worker_likely_ran: boolean; // true if today has data
    data_freshness_hours: number; // hours since latest record
    last_update_time: string | null; // ISO8601 of latest record timestamp
  };
}

export async function getMonitoringData(
  db: D1Database
): Promise<MonitoringData | null> {
  // Get today and yesterday date boundaries
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  const today = new Date(yesterday);
  today.setUTCDate(today.getUTCDate() + 1);

  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);
  const tomorrowStr = formatDate(tomorrow);

  // Query today's data
  const todayQuery = await db
    .prepare(`
      SELECT
        COUNT(*) as record_count,
        COUNT(DISTINCT segment_id) as sensor_count,
        MIN(hour_timestamp) as earliest_record,
        MAX(hour_timestamp) as latest_record
      FROM sensor_hourly_data
      WHERE hour_timestamp >= ?
        AND hour_timestamp < ?
    `)
    .bind(`${todayStr} 00:00:00Z`, `${tomorrowStr} 00:00:00Z`)
    .first<{
      record_count: number;
      sensor_count: number;
      earliest_record: string | null;
      latest_record: string | null;
    }>();

  // Query yesterday's data
  const yesterdayQuery = await db
    .prepare(`
      SELECT
        COUNT(*) as record_count,
        COUNT(DISTINCT segment_id) as sensor_count,
        MIN(hour_timestamp) as earliest_record,
        MAX(hour_timestamp) as latest_record
      FROM sensor_hourly_data
      WHERE hour_timestamp >= ?
        AND hour_timestamp < ?
    `)
    .bind(`${yesterdayStr} 00:00:00Z`, `${todayStr} 00:00:00Z`)
    .first<{
      record_count: number;
      sensor_count: number;
      earliest_record: string | null;
      latest_record: string | null;
    }>();

  if (!todayQuery || !yesterdayQuery) {
    return null;
  }

  const todayData = todayQuery;
  const yesterdayData = yesterdayQuery;

  // Calculate health metrics
  const countChange = todayData.record_count - yesterdayData.record_count;
  const countChangePercent =
    yesterdayData.record_count > 0
      ? (countChange / yesterdayData.record_count) * 100
      : todayData.record_count > 0
        ? 100
        : 0;

  const HEALTH_THRESHOLD = 0.7; // 70% of yesterday's count is acceptable
  const isHealthy =
    todayData.record_count >= yesterdayData.record_count * HEALTH_THRESHOLD;

  // Calculate data freshness
  const latestRecord = todayData.latest_record || yesterdayData.latest_record;
  let dataFreshnessHours = 0;
  let workerLikelyRan = false;

  if (latestRecord) {
    const latest = new Date(latestRecord);
    const diffMs = now.getTime() - latest.getTime();
    dataFreshnessHours = diffMs / (1000 * 60 * 60);
    // Worker likely ran if there's data from today (not just yesterday)
    workerLikelyRan = todayData.record_count > 0;
  }

  return {
    timestamp: formatDateTime(now),
    today: {
      date: todayStr,
      record_count: todayData.record_count,
      sensor_count: todayData.sensor_count,
      earliest_record: todayData.earliest_record,
      latest_record: todayData.latest_record,
    },
    yesterday: {
      date: yesterdayStr,
      record_count: yesterdayData.record_count,
      sensor_count: yesterdayData.sensor_count,
      earliest_record: yesterdayData.earliest_record,
      latest_record: yesterdayData.latest_record,
    },
    comparison: {
      count_change: countChange,
      count_change_percent: Math.round(countChangePercent * 100) / 100,
      is_healthy: isHealthy,
      threshold: HEALTH_THRESHOLD,
    },
    diagnostic: {
      worker_likely_ran: workerLikelyRan,
      data_freshness_hours: Math.round(dataFreshnessHours * 100) / 100,
      last_update_time: latestRecord,
    },
  };
}

/**
 * Get national weekly statistics for trend chart (last 52 weeks)
 */
export interface NationalWeeklyStats {
  week_ending: string;
  total_bikes: number;
}

export async function getNationalWeeklyStats(
  db: D1Database,
  weeks: number = 52
): Promise<NationalWeeklyStats[]> {
  const { results } = await db
    .prepare(`
      SELECT
        w.week_ending,
        COALESCE(SUM(w.total_bikes), 0) as total_bikes
      FROM sensor_weekly_stats w
      INNER JOIN sensor_locations s ON w.segment_id = s.segment_id
      WHERE s.county IS NOT NULL
      GROUP BY w.week_ending
      ORDER BY w.week_ending ASC
      LIMIT ?
    `)
    .bind(weeks)
    .all<NationalWeeklyStats>();

  return results || [];
}

/**
 * Get county-specific weekly statistics for trend chart (last 52 weeks)
 */
export interface CountyWeeklyStats {
  week_ending: string;
  total_bikes: number;
}

export async function getCountyWeeklyStats(
  db: D1Database,
  county: string,
  weeks: number = 52
): Promise<CountyWeeklyStats[]> {
  const { results } = await db
    .prepare(`
      SELECT
        week_ending,
        COALESCE(SUM(total_bikes), 0) as total_bikes
      FROM sensor_weekly_stats
      WHERE county = ?
      GROUP BY week_ending
      ORDER BY week_ending ASC
      LIMIT ?
    `)
    .bind(county, weeks)
    .all<CountyWeeklyStats>();

  return results || [];
}
