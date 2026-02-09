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
 * - Date range: Configurable via environment or defaults to previous day
 */

import { fetchWithRetry, RetryError } from '../shared/fetch-with-retry';
import { TelraamTrafficResponseSchema } from '../shared/telraam-schema';
import { formatDateTime } from '../shared/date-formatting';

interface Env {
  DB: D1Database;
  TELRAAM_API_KEY: string;
  HISTORICAL_BUCKET: R2Bucket;
  BACKFILL_DAYS_AGO?: string; // How many days back to fetch (default: 1)
  BATCH_SIZE?: string; // Number of sensors per batch (default: 10)
}

interface SensorLocation {
  segment_id: number;
  timezone: string;
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
      const daysAgo = parseInt(env.BACKFILL_DAYS_AGO || '1');

      // Calculate date to backfill (default: yesterday)
      const targetDate = new Date(now);
      targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);
      targetDate.setUTCHours(0, 0, 0, 0);

      const startDatetime = new Date(targetDate);
      const endDatetime = new Date(targetDate);
      endDatetime.setUTCDate(endDatetime.getUTCDate() + 1);
      endDatetime.setUTCSeconds(-1); // 23:59:59

      console.log(`📅 Backfilling date: ${targetDate.toISOString().split('T')[0]}`);
      console.log(`📊 Date range: ${formatDateTime(startDatetime)} to ${formatDateTime(endDatetime)}`);

      // Fetch all sensors from database
      console.log('🔍 Fetching sensors from database...');
      const { results: sensors } = await env.DB
        .prepare('SELECT segment_id, timezone FROM sensor_locations WHERE status != ?')
        .bind('inactive')
        .all<SensorLocation>();

      if (!sensors || sensors.length === 0) {
        console.log('⚠️  No active sensors found');
        return;
      }

      console.log(`✅ Found ${sensors.length} active sensors\n`);

      let totalHoursInserted = 0;
      let sensorsProcessed = 0;
      let sensorsWithData = 0;
      let sensorsErrored = 0;

      // Process sensors in batches
      for (let idx = 0; idx < sensors.length; idx++) {
        const sensor = sensors[idx];

        try {
          // Log progress every 10 sensors to avoid log size limit
          const shouldLogDetails = idx % 10 === 0;

          if (shouldLogDetails) {
            console.log(`🔄 [${idx + 1}/${sensors.length}] Processing sensor ${sensor.segment_id}...`);
          }

          // Fetch hourly data from Telraam API
          const hourlyData = await fetchHourlyData(
            env.TELRAAM_API_KEY,
            sensor.segment_id.toString(),
            startDatetime,
            endDatetime
          );

          if (hourlyData.length === 0) {
            if (shouldLogDetails) {
              console.log(`   ⚠️  No data available`);
            }
            sensorsProcessed++;
            continue;
          }

          // Insert into database
          const inserted = await insertHourlyData(env.DB, sensor.segment_id, hourlyData);
          totalHoursInserted += inserted;
          sensorsProcessed++;
          sensorsWithData++;

          if (shouldLogDetails) {
            console.log(`   ✅ Inserted ${inserted} hours (${hourlyData.length} fetched)`);
          }

          // Small delay between API calls to respect rate limits
          if (idx < sensors.length - 1) {
            await sleep(1000); // 1 second
          }

        } catch (error) {
          sensorsErrored++;
          console.error(`   ❌ Error processing sensor ${sensor.segment_id}:`, error);
          // Continue with next sensor
        }
      }

      const totalDuration = Date.now() - startTime;
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Backfill complete in ${(totalDuration / 1000).toFixed(1)}s`);
      console.log(`  Date: ${targetDate.toISOString().split('T')[0]}`);
      console.log(`  Sensors processed: ${sensorsProcessed}/${sensors.length}`);
      console.log(`  Sensors with data: ${sensorsWithData}`);
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

  const BATCH_SIZE = 50;
  let insertedCount = 0;

  for (let i = 0; i < hourlyData.length; i += BATCH_SIZE) {
    const batch = hourlyData.slice(i, i + BATCH_SIZE);

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
