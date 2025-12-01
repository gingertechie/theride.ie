/**
 * Scheduled Worker: Update Sensor Data
 * Runs nightly to fetch hourly traffic data from Telraam API
 * and update the D1 database with historical hourly bike counts
 */

interface Env {
  DB: D1Database;
  TELRAAM_API_KEY: string;
}

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
    console.log('Starting scheduled hourly sensor data update...');

    try {
      // Step 1: Clean up data older than 7 days
      await cleanupOldData(env.DB);

      // Step 2: Get all sensors we track
      const { results: sensors } = await env.DB
        .prepare('SELECT segment_id, timezone FROM sensor_locations')
        .all<SensorLocation>();

      if (!sensors || sensors.length === 0) {
        console.log('No sensors found in database');
        return;
      }

      console.log(`Found ${sensors.length} sensors to update`);

      // Step 3: For each sensor, determine what hours we need to fetch
      const now = new Date();
      const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

      let totalHoursInserted = 0;
      let sensorsUpdated = 0;

      for (const sensor of sensors) {
        try {
          // Get the latest hour we have for this sensor
          const { results: latestHours } = await env.DB
            .prepare('SELECT hour_timestamp FROM sensor_hourly_data WHERE segment_id = ? ORDER BY hour_timestamp DESC LIMIT 1')
            .bind(sensor.segment_id)
            .all<HourlyDataRow>();

          let startTime: Date;

          if (!latestHours || latestHours.length === 0) {
            // No data yet - fetch last 24 hours
            startTime = new Date(currentHour.getTime() - 24 * 60 * 60 * 1000);
            console.log(`Sensor ${sensor.segment_id}: No data found, fetching last 24 hours`);
          } else {
            // Have data - fetch from next hour after latest
            const lastHour = new Date(latestHours[0].hour_timestamp);
            startTime = new Date(lastHour.getTime() + 60 * 60 * 1000); // +1 hour
            console.log(`Sensor ${sensor.segment_id}: Last data at ${lastHour.toISOString()}, fetching from ${startTime.toISOString()}`);
          }

          // Don't fetch the current incomplete hour
          const endTime = new Date(currentHour.getTime() - 60 * 60 * 1000); // -1 hour from current

          if (startTime >= currentHour) {
            console.log(`Sensor ${sensor.segment_id}: Already up to date`);
            continue;
          }

          // Fetch hourly data from Telraam
          const hourlyData = await fetchHourlyData(
            env.TELRAAM_API_KEY,
            sensor.segment_id.toString(),
            startTime,
            endTime
          );

          if (hourlyData.length === 0) {
            console.log(`Sensor ${sensor.segment_id}: No new data available`);
            continue;
          }

          // Insert hourly data (batch by 50 to avoid subrequest limits)
          const inserted = await insertHourlyData(env.DB, sensor.segment_id, hourlyData);
          totalHoursInserted += inserted;
          sensorsUpdated++;

          console.log(`Sensor ${sensor.segment_id}: Inserted ${inserted} hours of data`);

        } catch (error) {
          console.error(`Error processing sensor ${sensor.segment_id}:`, error);
          // Continue with next sensor
        }
      }

      console.log(`Update complete: ${sensorsUpdated} sensors updated, ${totalHoursInserted} total hours inserted`);

    } catch (error) {
      console.error('Error in scheduled worker:', error);
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
    time_start: formatTelraamDateTime(startTime),
    time_end: formatTelraamDateTime(endTime),
  };

  console.log(`Fetching data for segment ${segmentId} from ${body.time_start} to ${body.time_end}`);

  const response = await fetch('https://telraam-api.net/v1/reports/traffic', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telraam API error for segment ${segmentId}: ${response.status} ${errorText}`);
  }

  const data: TelraamTrafficResponse = await response.json();
  return data.report || [];
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
      const hourTimestamp = `${report.date} ${String(report.hour).padStart(2, '0')}:00:00Z`;

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
    });

    try {
      await db.batch(statements);
      insertedCount += batch.length;
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
  const cutoffDate = formatTelraamDateTime(sevenDaysAgo);

  console.log(`Cleaning up data older than ${cutoffDate}`);

  const result = await db
    .prepare('DELETE FROM sensor_hourly_data WHERE hour_timestamp < ?')
    .bind(cutoffDate)
    .run();

  console.log(`Deleted ${result.meta.changes || 0} old hourly records`);
}

/**
 * Format Date object to Telraam API datetime format
 */
function formatTelraamDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}Z`;
}
