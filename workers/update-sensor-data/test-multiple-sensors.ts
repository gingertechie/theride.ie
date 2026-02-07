/**
 * Test multiple sensors without data to find pattern
 */

const SENSORS_WITHOUT_DATA = [
  { id: '9000009735', name: 'R135' },
  { id: '9000001470', name: 'Crumlin Road' },
  { id: '9000009396', name: 'Spencer Dock' },
];

interface TelraamTrafficResponse {
  report: any[];
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

async function testSensor(apiKey: string, segmentId: string, sensorName: string) {
  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const startTime = new Date(currentHour.getTime() - 24 * 60 * 60 * 1000);
  const endTime = new Date(currentHour.getTime() - 60 * 60 * 1000);

  const body = {
    level: 'segments',
    format: 'per-hour',
    id: segmentId,
    time_start: formatTelraamDateTime(startTime),
    time_end: formatTelraamDateTime(endTime),
  };

  console.log(`\n📡 Testing: ${segmentId} (${sensorName})`);

  try {
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
      console.log(`   ❌ API Error: ${response.status} ${errorText}`);
      return { id: segmentId, name: sensorName, status: 'error', records: 0, error: `${response.status} ${errorText}` };
    }

    const data: TelraamTrafficResponse = await response.json();
    const recordCount = data.report?.length || 0;

    if (recordCount > 0) {
      console.log(`   ✅ Returns ${recordCount} records`);
    } else {
      console.log(`   ⚠️  Returns 0 records (sensor may be offline)`);
    }

    return { id: segmentId, name: sensorName, status: 'success', records: recordCount };

  } catch (error) {
    console.log(`   ❌ Exception: ${error.message}`);
    return { id: segmentId, name: sensorName, status: 'exception', records: 0, error: error.message };
  }
}

async function main() {
  const apiKey = process.env.TELRAAM_API_KEY;

  if (!apiKey) {
    console.error('❌ TELRAAM_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('🔍 Testing Sensors Without Data');
  console.log('='.repeat(70));

  const results = [];

  for (const sensor of SENSORS_WITHOUT_DATA) {
    const result = await testSensor(apiKey, sensor.id, sensor.name);
    results.push(result);
    // Sleep to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 Summary:');
  console.log('='.repeat(70));

  const withData = results.filter(r => r.records > 0);
  const noData = results.filter(r => r.records === 0 && r.status === 'success');
  const errors = results.filter(r => r.status === 'error' || r.status === 'exception');

  console.log(`\n✅ Sensors with API data: ${withData.length}`);
  withData.forEach(r => console.log(`   - ${r.id} (${r.name}): ${r.records} records`));

  console.log(`\n⚠️  Sensors with no API data (offline?): ${noData.length}`);
  noData.forEach(r => console.log(`   - ${r.id} (${r.name})`));

  console.log(`\n❌ Sensors with API errors: ${errors.length}`);
  errors.forEach(r => console.log(`   - ${r.id} (${r.name}): ${r.error}`));

  console.log('\n' + '='.repeat(70));
}

main();
