#!/usr/bin/env node
/**
 * Backfill Script: Historical Sensor Data
 *
 * Usage:
 *   npm run backfill -- 2025-11-30                  # Backfill all sensors for Nov 30
 *   npm run backfill -- 2025-11-30 9000005607       # Backfill specific sensor for Nov 30
 *
 * This script fetches hourly traffic data from Telraam API for a specific date
 * and inserts it into the production D1 database.
 */

interface SensorLocation {
  segment_id: number;
  timezone: string;
}

interface TelraamHourlyReport {
  date: string; // "2025-11-30"
  hour: number; // 0-23
  uptime: number; // 0-1
  heavy: number | null;
  car: number | null;
  bike: number | null;
  pedestrian: number | null;
  v85?: number | null;
}

interface TelraamTrafficResponse {
  report: TelraamHourlyReport[];
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Backfill Sensor Data Script

Usage:
  npm run backfill -- YYYY-MM-DD [segment_id]

Arguments:
  YYYY-MM-DD    Date to backfill (e.g., 2025-11-30)
  segment_id    Optional: Specific sensor segment to backfill
                If omitted, backfills all sensors

Examples:
  npm run backfill -- 2025-11-30                # All sensors for Nov 30
  npm run backfill -- 2025-11-30 9000005607     # Single sensor for Nov 30
  `);
  process.exit(0);
}

const dateStr = args[0];
const segmentId = args[1] ? parseInt(args[1]) : null;

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  console.error('❌ Error: Date must be in YYYY-MM-DD format');
  process.exit(1);
}

// Validate segment ID if provided
if (segmentId !== null && isNaN(segmentId)) {
  console.error('❌ Error: Segment ID must be a number');
  process.exit(1);
}

console.log('🔄 Backfill Sensor Data');
console.log('=======================');
console.log(`📅 Date: ${dateStr}`);
console.log(`🎯 Segment: ${segmentId || 'All sensors'}`);
console.log('');

/**
 * Main backfill function
 */
async function backfillData(): Promise<void> {
  // Get API key from environment
  const apiKey = process.env.TELRAAM_API_KEY;
  if (!apiKey) {
    throw new Error('TELRAAM_API_KEY environment variable is required');
  }

  // Parse the date and create start/end times for the full day
  const targetDate = new Date(dateStr + 'T00:00:00Z');
  const startTime = new Date(targetDate);
  const endTime = new Date(targetDate);
  endTime.setUTCDate(endTime.getUTCDate() + 1); // Next day at midnight
  endTime.setUTCSeconds(endTime.getUTCSeconds() - 1); // 23:59:59

  console.log(`📊 Fetching data from ${formatTelraamDateTime(startTime)} to ${formatTelraamDateTime(endTime)}`);
  console.log('');

  // Determine which sensors to process
  let sensors: SensorLocation[];

  if (segmentId !== null) {
    // Single sensor
    sensors = [{ segment_id: segmentId, timezone: 'Europe/Brussels' }];
  } else {
    // Fetch all sensors from database using wrangler
    console.log('🔍 Fetching all sensors from database...');
    const sensorsJson = await execWrangler(`d1 execute theride-db --remote --json --command "SELECT segment_id, timezone FROM sensor_locations"`);
    const sensorsResult = JSON.parse(sensorsJson);

    if (!sensorsResult[0]?.results || sensorsResult[0].results.length === 0) {
      throw new Error('No sensors found in database');
    }

    sensors = sensorsResult[0].results;
    console.log(`✅ Found ${sensors.length} sensors\n`);
  }

  let totalHoursInserted = 0;
  let sensorsProcessed = 0;
  let sensorsWithData = 0;

  // Process each sensor
  for (let idx = 0; idx < sensors.length; idx++) {
    const sensor = sensors[idx];
    try {
      // Log progress every 10 sensors or for single sensor mode
      const shouldLogDetails = sensors.length === 1 || idx % 10 === 0;

      if (shouldLogDetails) {
        console.log(`🔄 [${idx + 1}/${sensors.length}] Processing sensor ${sensor.segment_id}...`);
      }

      // Fetch hourly data from Telraam API
      const hourlyData = await fetchHourlyData(
        apiKey,
        sensor.segment_id.toString(),
        startTime,
        endTime
      );

      if (hourlyData.length === 0) {
        if (shouldLogDetails) {
          console.log(`   ⚠️  No data available from Telraam API`);
        }
        sensorsProcessed++;
        continue;
      }

      // Insert into database
      const inserted = await insertHourlyData(sensor.segment_id, hourlyData);
      totalHoursInserted += inserted;
      sensorsProcessed++;
      sensorsWithData++;

      if (shouldLogDetails) {
        console.log(`   ✅ Inserted ${inserted} hours (${hourlyData.length} fetched)\n`);
      }

    } catch (error) {
      console.error(`   ❌ Error processing sensor ${sensor.segment_id}:`, error);
      // Continue with next sensor
    }
  }

  console.log('');
  console.log('✅ Backfill Complete!');
  console.log('===================');
  console.log(`📊 Sensors processed: ${sensorsProcessed}/${sensors.length}`);
  console.log(`📈 Sensors with data: ${sensorsWithData}`);
  console.log(`⏰ Total hours inserted: ${totalHoursInserted}`);
}

/**
 * Fetch hourly traffic data from Telraam API
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
    throw new Error(`Telraam API error: ${response.status} ${errorText}`);
  }

  const data: TelraamTrafficResponse = await response.json();
  return data.report || [];
}

/**
 * Insert hourly data into the production database using wrangler
 */
async function insertHourlyData(
  segmentId: number,
  hourlyData: TelraamHourlyReport[]
): Promise<number> {

  if (hourlyData.length === 0) return 0;

  const BATCH_SIZE = 50;
  let insertedCount = 0;

  for (let i = 0; i < hourlyData.length; i += BATCH_SIZE) {
    const batch = hourlyData.slice(i, i + BATCH_SIZE);

    // Build SQL statements for batch
    const values: string[] = [];
    const params: (string | number | null)[] = [];

    for (const report of batch) {
      // Convert date + hour to ISO8601 timestamp
      // Telraam API may return date as ISO timestamp or date string, so parse it carefully
      let dateStr: string;
      if (report.date.includes('T')) {
        // Full ISO timestamp like "2025-12-01T14:00:00.000Z"
        // Extract just the date part and hour
        const parsedDate = new Date(report.date);
        const year = parsedDate.getUTCFullYear();
        const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(parsedDate.getUTCDate()).padStart(2, '0');
        const hour = String(parsedDate.getUTCHours()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
        const hourTimestamp = `${dateStr} ${hour}:00:00Z`;

        values.push('(?, ?, ?, ?, ?, ?, ?, ?)');
        params.push(
          segmentId,
          hourTimestamp,
          report.bike ?? 0,
          report.car ?? 0,
          report.heavy ?? 0,
          report.pedestrian ?? 0,
          report.v85 ?? null,
          report.uptime
        );
      } else {
        // Simple date string like "2025-12-01" with separate hour field
        dateStr = report.date;
        const hourTimestamp = `${dateStr} ${String(report.hour).padStart(2, '0')}:00:00Z`;

        values.push('(?, ?, ?, ?, ?, ?, ?, ?)');
        params.push(
          segmentId,
          hourTimestamp,
          report.bike ?? 0,
          report.car ?? 0,
          report.heavy ?? 0,
          report.pedestrian ?? 0,
          report.v85 ?? null,
          report.uptime
        );
      }
    }

    // Execute batch insert
    const sql = `
      INSERT INTO sensor_hourly_data (
        segment_id,
        hour_timestamp,
        bike,
        car,
        heavy,
        pedestrian,
        v85,
        uptime
      ) VALUES ${values.join(', ')}
      ON CONFLICT (segment_id, hour_timestamp) DO UPDATE SET
        bike = excluded.bike,
        car = excluded.car,
        heavy = excluded.heavy,
        pedestrian = excluded.pedestrian,
        v85 = excluded.v85,
        uptime = excluded.uptime
    `;

    // Create a temporary SQL file with the batch
    const tempFile = `/tmp/backfill-batch-${Date.now()}.sql`;
    const fs = await import('fs/promises');

    // Escape and format SQL with values
    let formattedSql = sql;
    for (const param of params) {
      const value = param === null ? 'NULL' :
                    typeof param === 'number' ? param.toString() :
                    `'${param.toString().replace(/'/g, "''")}'`;
      formattedSql = formattedSql.replace('?', value);
    }

    await fs.writeFile(tempFile, formattedSql);

    try {
      await execWrangler(`d1 execute theride-db --remote --file=${tempFile}`, { quiet: true });
      insertedCount += batch.length;
    } catch (error) {
      console.error(`   ⚠️  Error inserting batch:`, error);
      throw error;
    } finally {
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {});
    }
  }

  return insertedCount;
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

/**
 * Execute wrangler command and return output
 */
async function execWrangler(command: string, options?: { quiet?: boolean }): Promise<string> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync(`npx wrangler ${command}`);

    // Wrangler often outputs warnings to stderr, which is normal
    // Only throw if stderr contains actual errors (not warnings)
    if (stderr && stderr.includes('ERROR') && !stderr.includes('WARNING')) {
      throw new Error(stderr);
    }

    // In quiet mode, don't return the full output to prevent log spam
    // Just return a success indicator
    if (options?.quiet) {
      return JSON.stringify({ success: true });
    }

    return stdout;
  } catch (error: any) {
    // If the command failed (non-zero exit code), throw the error
    if (error.code && error.code !== 0) {
      throw new Error(`Wrangler command failed: ${error.message}`);
    }
    throw error;
  }
}

// Run the backfill
backfillData().catch(error => {
  console.error('\n❌ Backfill failed:', error);
  process.exit(1);
});
