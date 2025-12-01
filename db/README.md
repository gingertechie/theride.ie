# Cloudflare D1 Database Setup

This directory contains the database schema and migrations for the Telraam sensor locations.

## Initial Setup

### 1. Create the D1 Database

```bash
# Create a new D1 database
npx wrangler d1 create theride-db
```

This will output a database ID. Copy it and update the `database_id` in `wrangler.toml`.

### 2. Run the Schema

```bash
# Create the tables
npx wrangler d1 execute theride-db --file=./db/schema.sql
```

### 3. Seed Initial Data

```bash
# Insert the initial sensor location
npx wrangler d1 execute theride-db --file=./db/migrations/0001_seed_sensor_locations.sql
```

## Local Development

For local development, you need to create a local D1 database:

```bash
# Create local database and run schema
npx wrangler d1 execute theride-db --local --file=./db/schema.sql

# Seed local data
npx wrangler d1 execute theride-db --local --file=./db/migrations/0001_seed_sensor_locations.sql
```

## Querying the Database

### Using Wrangler CLI

```bash
# Query production database
npx wrangler d1 execute theride-db --command "SELECT * FROM sensor_locations"

# Query local database
npx wrangler d1 execute theride-db --local --command "SELECT * FROM sensor_locations"
```

### From Astro Pages

The D1 database is available via `locals.runtime.env.DB`:

```typescript
// Example: src/pages/api/example.ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;
  const { results } = await db
    .prepare('SELECT * FROM sensor_locations')
    .all<SensorLocation>();

  return new Response(JSON.stringify(results));
};
```

## Schema

### sensor_locations

Stores Telraam traffic sensor locations and traffic measurement data.

| Column | Type | Description |
|--------|------|-------------|
| segment_id | INTEGER | Primary key, unique sensor identifier |
| last_data_package | TEXT | Timestamp of last data update from sensor |
| timezone | TEXT | Timezone for the sensor location (default: 'Europe/Brussels') |
| date | TEXT | Date of the measurement data |
| period | TEXT | Aggregation period: 'hourly', 'daily', or 'monthly' |
| uptime | REAL | Percentage of time sensor was operational (0.0-1.0) |
| heavy | REAL | Number of heavy vehicles counted in the period |
| car | REAL | Number of cars counted in the period |
| bike | REAL | Number of bikes counted in the period |
| pedestrian | REAL | Number of pedestrians counted in the period |
| night | REAL | Number of vehicles counted during night hours |
| v85 | REAL | 85th percentile speed of vehicles (km/h) |
| latitude | REAL | GPS latitude coordinate (required) |
| longitude | REAL | GPS longitude coordinate (required) |
| country | TEXT | Country name (e.g., 'Ireland') |
| county | TEXT | County name (e.g., 'County Dublin', 'County Cork') |
| city_town | TEXT | City or town name |
| locality | TEXT | Specific locality or neighborhood |
| eircode | TEXT | Irish postal code |
| created_at | TEXT | Record creation timestamp |
| updated_at | TEXT | Record last update timestamp |

**Indexes:**
- `idx_sensor_coordinates`: (latitude, longitude) - for geospatial queries
- `idx_last_data`: (last_data_package) - for finding recent updates
- `idx_sensor_date`: (date) - for date-based queries
- `idx_sensor_period`: (period) - for period-based queries
- `idx_sensor_county`: (county) - for county-based queries

## Adding More Sensors

To add more sensor locations, create a new migration file:

```bash
# Create new migration
touch db/migrations/0002_add_sensors.sql
```

Then add your INSERT statements and run:

```bash
npx wrangler d1 execute theride-db --file=./db/migrations/0002_add_sensors.sql
```

## Production Deployment

When deploying to Cloudflare, the D1 database binding is automatically available through the wrangler.toml configuration. Make sure to:

1. Run all migrations on the production database
2. Update the `database_id` in wrangler.toml with your production database ID

## API Endpoints

The following API endpoints are available:

### Statistics Endpoints

- `GET /api/stats/national.json` - Get national aggregated statistics
  - Returns total bike/car/pedestrian/heavy counts, sensor count, and last update timestamp

- `GET /api/stats/counties.json` - Get county leaderboard
  - Query params: `limit` (default: 3) - number of top counties to return
  - Returns counties sorted by total bike count with sensor counts and averages

- `GET /api/stats/county/{county}.json` - Get detailed county statistics
  - Example: `/api/stats/county/County%20Dublin.json`
  - Returns county stats plus complete list of all sensors in that county
  - Sensors are sorted by bike count (highest first)

### Available Counties

The database currently contains sensors from these Irish counties:
- County Clare
- County Cork
- County Dublin
- County Galway
- County Kildare
- County Mayo
- County Meath
- County Wexford

### Database Utility Functions

The following functions are available in `src/utils/db.ts`:

- `getNationalStats(db)` - Get aggregated national statistics
- `getTopCountiesByBikes(db, limit)` - Get top counties by bike count
- `getCountyDetails(db, county)` - Get detailed county data with all sensors
- `getAllSensors(db)` - List all sensors
- `getSensorById(db, segmentId)` - Get single sensor by ID
- `getSensorsByPeriod(db, period)` - Get sensors by aggregation period
- `upsertSensor(db, sensor)` - Insert or update sensor data
