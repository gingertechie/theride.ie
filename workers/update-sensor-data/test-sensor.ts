/**
 * Test script to debug sensor 9000009735
 * Run with: npx tsx test-sensor.ts
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

  console.log(`\n📡 Fetching data for segment ${segmentId}`);
  console.log(`   From: ${body.time_start}`);
  console.log(`   To:   ${body.time_end}`);
  console.log(`   Request body:`, JSON.stringify(body, null, 2));

  const response = await fetch('https://telraam-api.net/v1/reports/traffic', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.log(`\n📥 Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Telraam API error: ${response.status} ${errorText}`);
    throw new Error(`Telraam API error for segment ${segmentId}: ${response.status} ${errorText}`);
  }

  const data: TelraamTrafficResponse = await response.json();
  console.log(`\n✅ Data received: ${data.report?.length || 0} hourly records`);

  if (data.report && data.report.length > 0) {
    console.log(`\n📊 Sample of first 3 records:`);
    data.report.slice(0, 3).forEach((record, i) => {
      console.log(`   [${i}] ${record.date} ${record.hour}:00 - bikes: ${record.bike}, uptime: ${record.uptime}`);
    });
  }

  return data.report || [];
}

async function main() {
  const SENSOR_ID = '9000009735';

  // Get API key from environment
  const apiKey = process.env.TELRAAM_API_KEY;
  if (!apiKey) {
    console.error('❌ TELRAAM_API_KEY environment variable not set');
    console.log('   Set it with: export TELRAAM_API_KEY=your_key_here');
    process.exit(1);
  }

  console.log('🔍 Testing Telraam API for sensor 9000009735 (Meath - R135)');
  console.log('=' .repeat(60));

  // Test 1: Last 24 hours
  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const startTime = new Date(currentHour.getTime() - 24 * 60 * 60 * 1000);
  const endTime = new Date(currentHour.getTime() - 60 * 60 * 1000);

  console.log('\n🧪 Test 1: Fetch last 24 hours of data');
  try {
    const data = await fetchHourlyData(apiKey, SENSOR_ID, startTime, endTime);

    if (data.length === 0) {
      console.log('\n⚠️  No data returned from API');
      console.log('   Possible reasons:');
      console.log('   - Sensor has no recent data');
      console.log('   - Sensor is offline or not recording');
      console.log('   - Time range is outside available data');
    } else {
      console.log(`\n✅ Success! Retrieved ${data.length} hours of data`);
    }
  } catch (error) {
    console.error('\n❌ Error fetching data:', error);
  }

  // Test 2: Try a longer time range (last 7 days)
  console.log('\n\n🧪 Test 2: Fetch last 7 days of data');
  const sevenDaysAgo = new Date(currentHour.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const data = await fetchHourlyData(apiKey, SENSOR_ID, sevenDaysAgo, endTime);

    if (data.length === 0) {
      console.log('\n⚠️  No data returned from API for 7-day range either');
    } else {
      console.log(`\n✅ Success! Retrieved ${data.length} hours of data from 7-day range`);
    }
  } catch (error) {
    console.error('\n❌ Error fetching data:', error);
  }

  console.log('\n' + '='.repeat(60));
}

main();
