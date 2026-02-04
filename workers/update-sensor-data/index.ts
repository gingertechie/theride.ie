/**
 * Update Sensor Data Worker
 *
 * Incrementally fetches hourly traffic data from Telraam API for all sensors.
 *
 * Design:
 * - Schedule-agnostic: Works with any cron schedule
 * - Per-sensor incremental: Fetches from latest DB timestamp to now
 * - Rate limited: 5s between API calls to respect Telraam limits
 * - Upsert pattern: Safe to re-run without duplicating data
 * - 7-day retention: Automatically cleans up old hourly data
 *
 * Each sensor independently determines its fetch range based on
 * its latest hour_timestamp in the sensor_hourly_data table.
 */

import { fetchWithRetry, RetryError } from '../shared/fetch-with-retry';
import { TelraamTrafficResponseSchema } from '../shared/telraam-schema';
import { formatDateTime } from '../shared/date-formatting';

interface Env {
  DB: D1Database;
  TELRAAM_API_KEY: string;
}

// Configuration
const CHUNK_SIZE = 8; // Process 8 sensors per invocation (stays under 50 subrequests)

interface SensorLocation {
  segment_id: number;
  timezone: string;
}

interface HourlyDataRow {
  segment_id: number;
  hour_timestamp: string;
}

interface TelraamHourlyReport {
  date: string; // "2025-11-30"
  hour: number; // 0-23
  uptime: number; // 0-1
  heavy: number;
  car: number;
  bike: number;
  pedestrian: number;
  v85?: number;
}

interface TelraamTrafficResponse {
  report: TelraamHourlyReport[];
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const startTime = Date.now();
    const now = new Date();
    console.log(`[${now.toISOString()}] Starting scheduled sensor data update...`);

    try {
      // Step 1: Clean up data older than 7 days
      await cleanupOldData(env.DB);

      // Step 2: Get all sensors we track (ORDER BY for deterministic processing)
      const { results: sensors } = await env.DB
        .prepare('SELECT segment_id, timezone FROM sensor_locations ORDER BY segment_id ASC')
        .all<SensorLocation>();

      if (!sensors || sensors.length === 0) {
        console.log('No sensors found in database');
        return;
      }

      console.log(`Fetched ${sensors.length} sensors from database`);
      console.log(`Processing all sensors with incremental fetching`);

      // Step 3: Process each sensor
      const currentHourDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      let totalHoursInserted = 0;
      let sensorsUpdated = 0;
      let sensorsSkipped = 0;
      let sensorsErrored = 0;
      const processedSensors: number[] = [];

      for (let i = 0; i < sensors.length; i++) {
        const sensor = sensors[i];
        const sensorStartTime = Date.now();

        console.log(`\n[Sensor ${i + 1}/${sensors.length}] Processing segment_id: ${sensor.segment_id}`);

        try {
          // Get the latest hour we have for this sensor
          const { results: latestHours } = await env.DB
            .prepare('SELECT hour_timestamp FROM sensor_hourly_data WHERE segment_id = ? ORDER BY hour_timestamp DESC LIMIT 1')
            .bind(sensor.segment_id)
            .all<HourlyDataRow>();

          let fetchStartTime: Date;

          if (!latestHours || latestHours.length === 0) {
            // No data yet - fetch last 24 hours
            fetchStartTime = new Date(currentHourDate.getTime() - 24 * 60 * 60 * 1000);
            console.log(`  No existing data - fetching last 24 hours from ${fetchStartTime.toISOString()}`);
          } else {
            // Have data - fetch from next hour after latest
            const lastHour = new Date(latestHours[0].hour_timestamp);
            fetchStartTime = new Date(lastHour.getTime() + 60 * 60 * 1000); // +1 hour
            console.log(`  Last data: ${lastHour.toISOString()}, fetching from ${fetchStartTime.toISOString()}`);
          }

          // Don't fetch the current incomplete hour
          const fetchEndTime = new Date(currentHourDate.getTime() - 60 * 60 * 1000); // -1 hour from current

          if (fetchStartTime >= currentHourDate) {
            console.log(`  Already up to date - skipping`);
            sensorsSkipped++;
            continue;
          }

          // Sleep 5 seconds to avoid Telraam API rate limits (429 errors)
          if (i > 0) {
            console.log(`  Waiting 5s before API call...`);
            await sleep(5000);
          }

          // Fetch hourly data from Telraam
          const apiCallStart = Date.now();
          const hourlyData = await fetchHourlyData(
            env.TELRAAM_API_KEY,
            sensor.segment_id.toString(),
            fetchStartTime,
            fetchEndTime
          );
          const apiCallDuration = Date.now() - apiCallStart;
          console.log(`  API call completed in ${apiCallDuration}ms, returned ${hourlyData.length} records`);

          if (hourlyData.length === 0) {
            console.log(`  No new data available - skipping`);
            sensorsSkipped++;
            continue;
          }

          // Insert hourly data (batch by 50 to avoid subrequest limits)
          const insertStart = Date.now();
          const inserted = await insertHourlyData(env.DB, sensor.segment_id, hourlyData);
          const insertDuration = Date.now() - insertStart;

          totalHoursInserted += inserted;
          sensorsUpdated++;
          processedSensors.push(sensor.segment_id);

          const sensorDuration = Date.now() - sensorStartTime;
          console.log(`  ✅ Inserted ${inserted} hours in ${insertDuration}ms (total sensor time: ${sensorDuration}ms)`);

        } catch (error) {
          sensorsErrored++;
          const sensorDuration = Date.now() - sensorStartTime;
          console.error(`  ❌ Error after ${sensorDuration}ms:`, error);
          // Continue with next sensor
        }
      }

      const totalDuration = Date.now() - startTime;
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Update complete in ${(totalDuration / 1000).toFixed(1)}s`);
      console.log(`  Total sensors: ${sensors.length}`);
      console.log(`  Sensors updated: ${sensorsUpdated}`);
      console.log(`  Sensors skipped (up to date): ${sensorsSkipped}`);
      console.log(`  Sensors errored: ${sensorsErrored}`);
      console.log(`  Total hours inserted: ${totalHoursInserted}`);
      if (processedSensors.length > 0) {
        console.log(`  Successfully processed IDs: ${processedSensors.join(', ')}`);
      }
      console.log(`${'='.repeat(70)}`);

    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.error(`Worker failed after ${(totalDuration / 1000).toFixed(1)}s:`, error);
      throw error;
    }
  },
};

/**
 * Fetch hourly traffic data from Telraam API for a specific segment and time range
 * Uses exponential backoff retry for resilience against temporary API failures
 */
async function fetchHourlyData(
  apiKey: string,
  segmentId: string,
  startTime: Date,
  endTime: Date
): Promise<TelraamHourlyReport[]> {

  const body = {
    level: 'segments',
    format: 'per-hour',
    id: segmentId,
    time_start: formatDateTime(startTime),
    time_end: formatDateTime(endTime),
  };

  console.log(`Fetching data for segment ${segmentId} from ${body.time_start} to ${body.time_end}`);

  try {
    const response = await fetchWithRetry(
      'https://telraam-api.net/v1/reports/traffic',
      {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      {
        maxRetries: 3,
        initialDelayMs: 2000,
        maxDelayMs: 10000,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telraam API error for segment ${segmentId}: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Validate API response structure
    const validation = TelraamTrafficResponseSchema.safeParse(data);
    if (!validation.success) {
      console.error(`Invalid Telraam API response for segment ${segmentId}:`, validation.error);
      throw new Error(`Invalid API response structure: ${validation.error.message}`);
    }

    return validation.data.report || [];

  } catch (error) {
    if (error instanceof RetryError) {
      console.error(
        `Failed to fetch data for segment ${segmentId} after ${error.attempts} attempts. ` +
        `Last error: ${error.lastError.message}`
      );
    }
    throw error;
  }
}

/**
 * Insert hourly data into the database in batches
 */
async function insertHourlyData(
  db: D1Database,
  segmentId: number,
  hourlyData: TelraamHourlyReport[]
): Promise<number> {

  if (hourlyData.length === 0) return 0;

  const BATCH_SIZE = 50;
  let insertedCount = 0;

  for (let i = 0; i < hourlyData.length; i += BATCH_SIZE) {
    const batch = hourlyData.slice(i, i + BATCH_SIZE);

    const statements = batch.map(report => {
      // Convert date + hour to ISO8601 timestamp
      // Telraam API may return date as ISO timestamp or date string, so parse it carefully
      let hourTimestamp: string;

      // Validate report has required date field
      if (!report.date) {
        console.warn(`Skipping record with missing date for segment ${segmentId}`);
        return null;
      }

      if (report.date.includes('T')) {
        // Full ISO timestamp like "2025-12-01T14:00:00.000Z"
        // Extract just the date part and hour
        const parsedDate = new Date(report.date);

        // Validate the date is valid
        if (isNaN(parsedDate.getTime())) {
          console.warn(`Skipping record with invalid date "${report.date}" for segment ${segmentId}`);
          return null;
        }

        const year = parsedDate.getUTCFullYear();
        const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(parsedDate.getUTCDate()).padStart(2, '0');
        const hour = String(parsedDate.getUTCHours()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        hourTimestamp = `${dateStr} ${hour}:00:00Z`;
      } else {
        // Simple date string like "2025-12-01" with separate hour field
        // Validate the date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date)) {
          console.warn(`Skipping record with malformed date "${report.date}" for segment ${segmentId}`);
          return null;
        }

        // Validate hour is a valid number
        if (typeof report.hour !== 'number' || report.hour < 0 || report.hour > 23) {
          console.warn(`Skipping record with invalid hour "${report.hour}" for segment ${segmentId}`);
          return null;
        }

        hourTimestamp = `${report.date} ${String(report.hour).padStart(2, '0')}:00:00Z`;
      }

      return db.prepare(`
        INSERT INTO sensor_hourly_data (
          segment_id,
          hour_timestamp,
          bike,
          car,
          heavy,
          pedestrian,
          v85,
          uptime
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (segment_id, hour_timestamp) DO UPDATE SET
          bike = excluded.bike,
          car = excluded.car,
          heavy = excluded.heavy,
          pedestrian = excluded.pedestrian,
          v85 = excluded.v85,
          uptime = excluded.uptime
      `).bind(
        segmentId,
        hourTimestamp,
        report.bike,
        report.car,
        report.heavy,
        report.pedestrian,
        report.v85 ?? null,
        report.uptime
      );
    }).filter((stmt): stmt is D1PreparedStatement => stmt !== null); // Filter out invalid records

    // Skip if all records in batch were invalid
    if (statements.length === 0) {
      console.warn(`Skipping batch at index ${i} - all records were invalid`);
      continue;
    }

    try {
      await db.batch(statements);
      insertedCount += statements.length;
    } catch (error) {
      console.error(`Error inserting batch starting at index ${i}:`, error);
      throw error;
    }
  }

  return insertedCount;
}

/**
 * Clean up hourly data older than 7 days
 */
async function cleanupOldData(db: D1Database): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = formatDateTime(sevenDaysAgo);

  console.log(`Cleaning up data older than ${cutoffDate}`);

  const result = await db
    .prepare('DELETE FROM sensor_hourly_data WHERE hour_timestamp < ?')
    .bind(cutoffDate)
    .run();

  console.log(`Deleted ${result.meta.changes || 0} old hourly records`);
}

/**
 * Sleep for specified milliseconds to avoid API rate limits
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get sensors with oldest data (or no data) that need updating
 * Returns up to CHUNK_SIZE sensors, prioritizing:
 * 1. Sensors with no data (NULL hour_timestamp)
 * 2. Sensors with oldest hour_timestamp
 *
 * This creates a self-organizing priority queue - sensors naturally
 * get processed based on data freshness without external state tracking.
 */
async function getSensorsNeedingUpdate(db: D1Database, chunkSize: number): Promise<SensorLocation[]> {
  const { results } = await db
    .prepare(`
      SELECT
        sl.segment_id,
        sl.timezone,
        MAX(shd.hour_timestamp) as latest_hour
      FROM sensor_locations sl
      LEFT JOIN sensor_hourly_data shd ON sl.segment_id = shd.segment_id
      GROUP BY sl.segment_id, sl.timezone
      ORDER BY latest_hour ASC NULLS FIRST
      LIMIT ?
    `)
    .bind(chunkSize)
    .all<SensorLocation & { latest_hour: string | null }>();

  if (!results || results.length === 0) {
    return [];
  }

  // Log which sensors we selected and why
  const now = new Date();
  results.forEach((sensor, idx) => {
    if (!sensor.latest_hour) {
      console.log(`  ${idx + 1}. Sensor ${sensor.segment_id}: No data yet (never fetched)`);
    } else {
      const age = now.getTime() - new Date(sensor.latest_hour).getTime();
      const hoursOld = (age / (1000 * 60 * 60)).toFixed(1);
      console.log(`  ${idx + 1}. Sensor ${sensor.segment_id}: Data ${hoursOld}h old (${sensor.latest_hour})`);
    }
  });

  return results;
}
