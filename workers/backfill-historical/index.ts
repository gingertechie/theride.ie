/**
 * Backfill Historical Worker
 *
 * Scheduled worker that backfills historical sensor data from Telraam API
 * into the D1 database. Processes sensors in batches to avoid hitting
 * Cloudflare's subrequest and log size limits.
 *
 * Design:
 * - Runs on cron schedule (configure in wrangler.toml)
 * - Batched processing: Processes sensors in chunks
 * - Reduced logging: Logs progress every 10 sensors to stay under 256KB limit
 * - Null handling: Properly handles null values from Telraam API
 * - Smart backfill: For each sensor, finds oldest data and fetches N days before it
 * - Progressive: Avoids reprocessing existing data, fills backward in time
 */

import { fetchWithRetry, RetryError } from '../shared/fetch-with-retry';
import { TelraamTrafficResponseSchema } from '../shared/telraam-schema';
import { formatDateTime } from '../shared/date-formatting';

// Constants
const API_DELAY_MS = 5000; // 5 seconds between API calls to respect rate limits
const DB_INSERT_BATCH_SIZE = 50; // Batch size for D1 database inserts

interface Env {
  DB: D1Database;
  TELRAAM_API_KEY: string;
  HISTORICAL_BUCKET: R2Bucket;
  BACKFILL_DAYS?: string; // How many days to fetch before oldest data (default: 90)
  BATCH_SIZE?: string; // Number of sensors per batch (default: 10)
}

interface SensorLocation {
  segment_id: number;
  timezone: string;
}

interface SensorWithOldestData extends SensorLocation {
  oldest_hour: string | null;
}

interface TelraamHourlyReport {
  date?: string; // "2025-11-30"
  hour?: number; // 0-23
  uptime?: number; // 0-1
  heavy?: number | null;
  car?: number | null;
  bike?: number | null;
  pedestrian?: number | null;
  v85?: number | null;
}

/**
 * Get sensors with their oldest data timestamp
 * Used to determine backfill range for each sensor
 */
async function getSensorsWithOldestData(
  db: D1Database,
  limit: number,
  offset: number
): Promise<SensorWithOldestData[]> {
  const { results } = await db
    .prepare(`
      SELECT
        sl.segment_id,
        sl.timezone,
        MIN(shd.hour_timestamp) as oldest_hour
      FROM sensor_locations sl
      LEFT JOIN sensor_hourly_data shd ON sl.segment_id = shd.segment_id
      WHERE sl.status != ?
      GROUP BY sl.segment_id, sl.timezone
      ORDER BY sl.segment_id ASC
      LIMIT ? OFFSET ?
    `)
    .bind('inactive', limit, offset)
    .all<SensorWithOldestData>();

  return results || [];
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const startTime = Date.now();
    const now = new Date();
    console.log(`[${now.toISOString()}] Starting backfill worker...`);

    try {
      // Configuration
      const backfillDays = parseInt(env.BACKFILL_DAYS || '90');
      const batchSize = parseInt(env.BATCH_SIZE || '10');

      // Get total sensor count
      const { results: countResult } = await env.DB
        .prepare('SELECT COUNT(*) as total FROM sensor_locations WHERE status != ?')
        .bind('inactive')
        .all<{ total: number }>();

      const totalSensors = countResult?.[0]?.total || 0;

      if (totalSensors === 0) {
        console.log('⚠️  No active sensors found');
        return;
      }

      console.log(`📊 Configuration: backfill ${backfillDays} days before oldest data, batch size: ${batchSize}`);
      console.log(`📦 Total sensors: ${totalSensors}`);

      // For simplicity, start from offset 0 each run and process next batch of sensors
      // that need backfilling. This is stateless and self-organizing.
      const sensors = await getSensorsWithOldestData(env.DB, batchSize, 0);

      if (sensors.length === 0) {
        console.log('⚠️  No sensors need backfilling');
        return;
      }

      console.log(`\n📦 Processing ${sensors.length} sensors:\n`);

      let totalHoursInserted = 0;
      let sensorsBackfilled = 0;
      let sensorsSkipped = 0;
      let sensorsErrored = 0;

      for (let idx = 0; idx < sensors.length; idx++) {
        const sensor = sensors[idx];
        let startDatetime: Date | undefined;
        let endDatetime: Date | undefined;

        try {
          console.log(`🔄 [${idx + 1}/${sensors.length}] Sensor ${sensor.segment_id}...`);

          // Determine backfill range based on oldest data

          if (!sensor.oldest_hour) {
            // No data yet - fetch last backfillDays days up to end of yesterday
            endDatetime = new Date(now);
            endDatetime.setUTCHours(0, 0, 0, 0);  // Start of today
            endDatetime.setUTCSeconds(-1);        // End of yesterday (23:59:59)

            startDatetime = new Date(endDatetime);  // Start from end of yesterday
            startDatetime.setUTCDate(startDatetime.getUTCDate() - backfillDays);
            startDatetime.setUTCHours(0, 0, 0, 0);  // Beginning of that day

            console.log(`   No existing data - fetching ${backfillDays} days`);
          } else {
            // Has data - fetch backfillDays BEFORE oldest
            const oldestDate = new Date(sensor.oldest_hour);

            // End at oldest hour (ON CONFLICT will handle duplicates safely)
            endDatetime = new Date(oldestDate);

            // Start is backfillDays before oldest
            startDatetime = new Date(oldestDate);
            startDatetime.setUTCDate(startDatetime.getUTCDate() - backfillDays);
            startDatetime.setUTCHours(0, 0, 0, 0);

            console.log(`   Oldest data: ${sensor.oldest_hour}`);
            console.log(`   Fetching ${backfillDays} days before that`);
          }

          // Skip if date range is invalid (start >= end)
          if (startDatetime >= endDatetime) {
            console.log(`   ⏭️  Skipped - no gap to fill`);
            sensorsSkipped++;
            continue;
          }

          console.log(`   📅 Range: ${formatDateTime(startDatetime)} to ${formatDateTime(endDatetime)}`);

          // Fetch hourly data from Telraam API
          const hourlyData = await fetchHourlyData(
            env.TELRAAM_API_KEY,
            sensor.segment_id.toString(),
            startDatetime,
            endDatetime
          );

          if (hourlyData.length === 0) {
            console.log(`   ⚠️  No data available from API`);
            sensorsSkipped++;
            continue;
          }

          // Insert into database
          const inserted = await insertHourlyData(env.DB, sensor.segment_id, hourlyData);
          totalHoursInserted += inserted;
          sensorsBackfilled++;

          console.log(`   ✅ Inserted ${inserted} hours (${hourlyData.length} fetched)`);

          // Delay between API calls to respect rate limits
          if (idx < sensors.length - 1) {
            await sleep(API_DELAY_MS);
          }

        } catch (error) {
          sensorsErrored++;
          const rangeInfo = startDatetime && endDatetime
            ? `(range: ${formatDateTime(startDatetime)} to ${formatDateTime(endDatetime)})`
            : '';
          console.error(
            `   ❌ Error processing sensor ${sensor.segment_id} ${rangeInfo}:`,
            error instanceof Error ? error.message : error
          );
          // Continue with next sensor
        }
      }

      const totalDuration = Date.now() - startTime;
      console.log(`\n${'='.repeat(70)}`);
      console.log(`⏳ Batch complete in ${(totalDuration / 1000).toFixed(1)}s`);
      console.log(`  Sensors backfilled: ${sensorsBackfilled}`);
      console.log(`  Sensors skipped: ${sensorsSkipped}`);
      console.log(`  Sensors errored: ${sensorsErrored}`);
      console.log(`  Hours inserted: ${totalHoursInserted}`);
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

    // The validated data has all fields optional, so we return it as-is
    // and handle missing fields in insertHourlyData
    return (validation.data.report || []) as TelraamHourlyReport[];

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

  let insertedCount = 0;

  for (let i = 0; i < hourlyData.length; i += DB_INSERT_BATCH_SIZE) {
    const batch = hourlyData.slice(i, i + DB_INSERT_BATCH_SIZE);

    const statements = batch.map(report => {
      // Convert date + hour to ISO8601 timestamp
      let hourTimestamp: string;

      // Validate report has required date field
      if (!report.date) {
        console.warn(`Skipping record with missing date for segment ${segmentId}`);
        return null;
      }

      if (report.date.includes('T')) {
        // Full ISO timestamp like "2025-12-01T14:00:00.000Z"
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
        hourTimestamp = `${year}-${month}-${day} ${hour}:00:00Z`;
      } else {
        // Simple date string like "2025-12-01" with separate hour field
        if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date)) {
          console.warn(`Skipping record with malformed date "${report.date}" for segment ${segmentId}`);
          return null;
        }

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
        report.bike ?? 0,
        report.car ?? 0,
        report.heavy ?? 0,
        report.pedestrian ?? 0,
        report.v85 ?? null,
        report.uptime ?? 0
      );
    }).filter((stmt): stmt is D1PreparedStatement => stmt !== null);

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
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
