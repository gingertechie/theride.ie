/**
 * Import Telraam sensor data from CSV to D1 database
 * Usage: node db/scripts/import-sensors.js <path-to-csv>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CSV line (simple parser, handles empty fields)
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

// Escape SQL string values
function escapeSQLString(value) {
  if (value === null || value === undefined || value === '' || value === 'NaT') {
    return 'NULL';
  }
  return `'${value.replace(/'/g, "''")}'`;
}

// Format number for SQL (handle empty values)
function formatNumber(value) {
  if (value === null || value === undefined || value === '' || value === 'NaN' || value === 'NaT') {
    return 'NULL';
  }
  const num = parseFloat(value);
  return isNaN(num) ? 'NULL' : num;
}

async function importSensors(csvPath) {
  console.log(`Reading CSV from: ${csvPath}`);

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  // Parse header
  const header = parseCSVLine(lines[0]);
  console.log(`Found ${lines.length - 1} sensor records`);

  // Generate SQL INSERT statements
  const sqlStatements = [];
  let skippedCount = 0;
  let importedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    if (values.length < header.length) {
      console.warn(`Skipping line ${i + 1}: insufficient columns`);
      skippedCount++;
      continue;
    }

    // Map CSV columns to values
    const data = {};
    header.forEach((col, idx) => {
      data[col] = values[idx];
    });

    // Skip segment 9000009735 (has NaT date)
    if (data.segment_id === '9000009735') {
      console.log(`Skipping segment ${data.segment_id} (NaT date)`);
      skippedCount++;
      continue;
    }

    // Skip rows with NaT or missing critical data
    if (data.date === 'NaT' || !data.segment_id || !data.lat || !data.lon) {
      console.warn(`Skipping segment ${data.segment_id}: missing critical data`);
      skippedCount++;
      continue;
    }

    // Build INSERT statement
    const sql = `INSERT OR REPLACE INTO sensor_locations (
      segment_id, last_data_package, timezone, date, period, uptime,
      heavy, car, bike, pedestrian, night, v85,
      latitude, longitude, country, county, city_town, locality, eircode,
      updated_at
    ) VALUES (
      ${data.segment_id},
      ${escapeSQLString(data.last_data_package)},
      ${escapeSQLString(data.timezone)},
      ${escapeSQLString(data.date)},
      ${escapeSQLString(data.period)},
      ${formatNumber(data.uptime)},
      ${formatNumber(data.heavy)},
      ${formatNumber(data.car)},
      ${formatNumber(data.bike)},
      ${formatNumber(data.pedestrian)},
      ${formatNumber(data.night)},
      ${formatNumber(data.v85)},
      ${formatNumber(data.lat)},
      ${formatNumber(data.lon)},
      ${escapeSQLString(data.country)},
      ${escapeSQLString(data.county)},
      ${escapeSQLString(data['city-town'])},
      ${escapeSQLString(data.locality)},
      ${escapeSQLString(data.eircode)},
      datetime('now')
    );`;

    sqlStatements.push(sql);
    importedCount++;
  }

  // Write SQL file
  const outputPath = path.join(__dirname, '..', 'migrations', '0003_import_sensor_data.sql');
  const sqlContent = `-- Import sensor data from CSV snapshot\n-- Date: 2025-11-29\n-- Source: TelraamSensorsIreland_snapshot_20251129.csv\n\n${sqlStatements.join('\n\n')}`;

  fs.writeFileSync(outputPath, sqlContent);

  console.log(`\n✓ Generated SQL migration: ${outputPath}`);
  console.log(`✓ Records to import: ${importedCount}`);
  console.log(`✓ Records skipped: ${skippedCount}`);
  console.log(`\nTo import to local database, run:`);
  console.log(`npx wrangler d1 execute theride-db --local --file=${outputPath}`);
  console.log(`\nTo import to production database, run:`);
  console.log(`npx wrangler d1 execute theride-db --file=${outputPath}`);
}

// Get CSV path from command line argument
const csvPath = process.argv[2];

if (!csvPath) {
  console.error('Usage: node db/scripts/import-sensors.js <path-to-csv>');
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`Error: CSV file not found: ${csvPath}`);
  process.exit(1);
}

importSensors(csvPath).catch(err => {
  console.error('Error importing sensors:', err);
  process.exit(1);
});
