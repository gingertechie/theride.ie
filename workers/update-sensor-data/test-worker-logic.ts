/**
 * Test script to simulate worker logic for sensor 9000009735
 * This mimics what the scheduled worker does
 */

interface TelraamHourlyReport {
  date: string;
  hour: number;
  uptime: number;
  heavy: number;
  car: number;
  bike: number;
  pedestrian: number;
  v85?: number;
}

interface TelraamTrafficResponse {
  report: TelraamHourlyReport[];
}

function formatTelraamDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}Z`;
}

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

  console.log(`\n📡 API Request:`);
  console.log(`   Segment: ${segmentId}`);
  console.log(`   From: ${body.time_start}`);
  console.log(`   To:   ${body.time_end}`);

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

function simulateInsertHourlyData(
  segmentId: number,
  hourlyData: TelraamHourlyReport[]
): void {
  console.log(`\n💾 Simulating database insert for ${hourlyData.length} records...`);

  let validCount = 0;
  let invalidCount = 0;

  hourlyData.forEach((report, i) => {
    let hourTimestamp: string;

    // This is the exact logic from the worker
    if (!report.date) {
      console.warn(`   ⚠️  Record ${i}: Missing date field - SKIPPED`);
      invalidCount++;
      return;
    }

    if (report.date.includes('T')) {
      // Full ISO timestamp like "2025-12-01T14:00:00.000Z"
      const parsedDate = new Date(report.date);

      if (isNaN(parsedDate.getTime())) {
        console.warn(`   ⚠️  Record ${i}: Invalid date "${report.date}" - SKIPPED`);
        invalidCount++;
        return;
      }

      const year = parsedDate.getUTCFullYear();
      const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getUTCDate()).padStart(2, '0');
      const hour = String(parsedDate.getUTCHours()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      hourTimestamp = `${dateStr} ${hour}:00:00Z`;
    } else {
      // Simple date string like "2025-12-01" with separate hour field
      if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date)) {
        console.warn(`   ⚠️  Record ${i}: Malformed date "${report.date}" - SKIPPED`);
        invalidCount++;
        return;
      }

      if (typeof report.hour !== 'number' || report.hour < 0 || report.hour > 23) {
        console.warn(`   ⚠️  Record ${i}: Invalid hour "${report.hour}" (type: ${typeof report.hour}) - SKIPPED`);
        invalidCount++;
        return;
      }

      hourTimestamp = `${report.date} ${String(report.hour).padStart(2, '0')}:00:00Z`;
    }

    console.log(`   ✅ Record ${i}: ${hourTimestamp} - bikes: ${report.bike}, uptime: ${report.uptime}`);
    validCount++;
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Valid records: ${validCount}`);
  console.log(`   Invalid records (skipped): ${invalidCount}`);
}

async function main() {
  const SENSOR_ID = '9000009735';
  const apiKey = process.env.TELRAAM_API_KEY;

  if (!apiKey) {
    console.error('❌ TELRAAM_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('🔍 Simulating Worker Logic for Sensor 9000009735');
  console.log('='.repeat(70));

  // Simulate what the worker does:
  // 1. Assume no data exists (first run scenario)
  // 2. Fetch last 24 hours
  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const startTime = new Date(currentHour.getTime() - 24 * 60 * 60 * 1000);
  const endTime = new Date(currentHour.getTime() - 60 * 60 * 1000);

  console.log(`\n📅 Current hour: ${currentHour.toISOString()}`);
  console.log(`📅 Worker would fetch from: ${startTime.toISOString()}`);
  console.log(`📅 Worker would fetch to: ${endTime.toISOString()}`);

  try {
    const hourlyData = await fetchHourlyData(apiKey, SENSOR_ID, startTime, endTime);

    if (hourlyData.length === 0) {
      console.log('\n⚠️  No data returned from API');
      console.log('   Worker would log: "No new data available" and SKIP insert');
      return;
    }

    console.log(`\n✅ API returned ${hourlyData.length} hourly records`);
    console.log(`\n🔍 Inspecting data format for validation issues:`);
    console.log(`   First record structure:`, JSON.stringify(hourlyData[0], null, 2));

    // Simulate the insert logic
    simulateInsertHourlyData(parseInt(SENSOR_ID), hourlyData);

  } catch (error) {
    console.error('\n❌ Error:', error);
  }

  console.log('\n' + '='.repeat(70));
}

main();
