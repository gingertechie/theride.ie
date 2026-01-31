/**
 * Test script to verify batch processing logic
 */

const SENSORS_PER_BATCH = 15;
const BATCH_SCHEDULE = [0, 1, 2, 3, 4]; // Hours when worker runs

// Simulate 73 sensors
const totalSensors = 73;
const allSensors = Array.from({ length: totalSensors }, (_, i) => 9000001000 + i);

console.log('Batch Processing Simulation');
console.log('='.repeat(70));
console.log(`Total sensors: ${totalSensors}`);
console.log(`Sensors per batch: ${SENSORS_PER_BATCH}`);
console.log(`Batch schedule: hours ${BATCH_SCHEDULE.join(', ')} UTC (midnight-4am)`);
console.log('='.repeat(70));

const totalBatches = Math.ceil(allSensors.length / SENSORS_PER_BATCH);
console.log(`\nTotal batches needed: ${totalBatches}`);

console.log('\nNightly Batch Schedule (midnight-4am):');
console.log('='.repeat(70));

for (const hour of BATCH_SCHEDULE) {
  const batchIndex = BATCH_SCHEDULE.indexOf(hour);
  const batchStart = batchIndex * SENSORS_PER_BATCH;
  const batchEnd = Math.min(batchStart + SENSORS_PER_BATCH, allSensors.length);
  const sensors = allSensors.slice(batchStart, batchEnd);

  console.log(`\nHour ${String(hour).padStart(2, '0')}:00 UTC → Batch ${batchIndex + 1}/${totalBatches}`);
  console.log(`  Sensors ${batchStart + 1}-${batchEnd} (${sensors.length} sensors)`);
  console.log(`  IDs: ${sensors[0]} - ${sensors[sensors.length - 1]}`);
}

console.log('\n' + '='.repeat(70));
console.log('Coverage Analysis:');
console.log('='.repeat(70));

// Track which sensors get processed nightly
const processedSensors = new Set<number>();

for (const hour of BATCH_SCHEDULE) {
  const batchIndex = BATCH_SCHEDULE.indexOf(hour);
  const batchStart = batchIndex * SENSORS_PER_BATCH;
  const batchEnd = Math.min(batchStart + SENSORS_PER_BATCH, allSensors.length);
  const sensors = allSensors.slice(batchStart, batchEnd);

  sensors.forEach(s => processedSensors.add(s));
}

console.log(`\nSensors processed per night: ${processedSensors.size}/${totalSensors}`);

if (processedSensors.size === totalSensors) {
  console.log('✅ All sensors covered in nightly run!');
} else {
  console.log('❌ Missing sensors:', allSensors.filter(s => !processedSensors.has(s)));
}

// Find which sensors include 9000009735
const targetSensor = 9000009735;
const targetIndex = allSensors.findIndex(s => s >= targetSensor);

if (targetIndex >= 0) {
  const batchIndex = Math.floor(targetIndex / SENSORS_PER_BATCH);
  const hourToRun = BATCH_SCHEDULE[batchIndex];

  console.log(`\n📍 Sensor ${targetSensor} location:`);
  console.log(`  Position: ${targetIndex + 1} of ${totalSensors}`);
  console.log(`  Will be in batch ${batchIndex + 1}/${totalBatches}`);
  console.log(`  Processes at hour: ${String(hourToRun).padStart(2, '0')}:00 UTC each night`);
}

console.log('\n' + '='.repeat(70));
