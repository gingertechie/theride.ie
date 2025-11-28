# Cloudflare D1 Database - Quick Setup Guide

## What Was Created

### Database Schema
- **`db/schema.sql`**: Complete table schema for sensor_locations with all traffic measurement fields
- **`db/migrations/0001_seed_sensor_locations.sql`**: Initial data seeding from telraam_segment.json

### Configuration Files
- **`wrangler.toml`**: Cloudflare D1 database binding configuration
- **`src/env.d.ts`**: TypeScript types for D1 and SensorLocation interface

### Utilities
- **`src/utils/db.ts`**: Helper functions for database operations:
  - `getAllSensors()` - Get all sensors
  - `getSensorById()` - Get sensor by ID
  - `getSensorsInBounds()` - Geographic bounding box search
  - `getSensorsByPeriod()` - Filter by aggregation period
  - `getSensorsByDate()` - Filter by date
  - `upsertSensor()` - Insert or update sensor
  - `getSensorStats()` - Get traffic statistics
  - `deleteSensor()` - Remove sensor

### API Endpoints
- **`GET /api/sensors.json`** - List all sensors
- **`GET /api/sensors/[id].json`** - Get specific sensor
- **`PUT /api/sensors/[id].json`** - Update/insert sensor
- **`DELETE /api/sensors/[id].json`** - Delete sensor
- **`GET /api/sensors/[id]/stats.json`** - Get sensor statistics
- **`POST /api/sensors/search.json`** - Search sensors by bounds/period/date

## Setup Steps

### 1. Create the Database

```bash
npx wrangler d1 create theride-db
```

This will output something like:
```
✅ Successfully created DB 'theride-db'!
binding = "DB"
database_name = "theride-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2. Update wrangler.toml

Copy the `database_id` from step 1 and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "theride-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # <-- Add your ID here
```

### 3. Run Schema (Production)

```bash
npx wrangler d1 execute theride-db --file=./db/schema.sql
```

### 4. Seed Initial Data (Production)

```bash
npx wrangler d1 execute theride-db --file=./db/migrations/0001_seed_sensor_locations.sql
```

### 5. Verify the Data

```bash
npx wrangler d1 execute theride-db --command "SELECT * FROM sensor_locations"
```

## Local Development Setup

For local development with D1 database bindings, use the `dev:wrangler` script instead of regular `dev`:

```bash
# Run dev server with D1 bindings (IMPORTANT!)
npm run dev:wrangler
```

This uses `wrangler pages dev` to wrap the Astro dev server and provide D1 bindings. The first time you run this, wrangler will automatically create a local database.

### Initialize Local Database (First Time Only)

After starting the dev server, initialize the local database in a separate terminal:

```bash
# Create schema locally (in wrangler's local DB)
npx wrangler d1 execute theride-db --local --file=./db/schema.sql

# Seed local data
npx wrangler d1 execute theride-db --local --file=./db/migrations/0001_seed_sensor_locations.sql

# Verify local data
npx wrangler d1 execute theride-db --local --command "SELECT * FROM sensor_locations"
```

**Note:** Local D1 databases are stored in `.wrangler/state/v3/d1/` and persist between dev sessions.

## Testing the API

Once your dev server is running (`npm run dev`), test the endpoints:

```bash
# Get all sensors
curl http://localhost:4321/api/sensors.json

# Get sensor by ID
curl http://localhost:4321/api/sensors/26408.json

# Get sensor stats
curl http://localhost:4321/api/sensors/26408/stats.json

# Search by period
curl -X POST http://localhost:4321/api/sensors/search.json \
  -H "Content-Type: application/json" \
  -d '{"period": "hourly"}'

# Search by geographic bounds
curl -X POST http://localhost:4321/api/sensors/search.json \
  -H "Content-Type: application/json" \
  -d '{
    "bounds": {
      "minLat": 51.0,
      "maxLat": 51.1,
      "minLon": 3.7,
      "maxLon": 3.8
    }
  }'
```

## Using in Your Code

### In an Astro page:

```typescript
---
import { getSensorById } from '@/utils/db';

const db = Astro.locals.runtime.env.DB;
const sensor = await getSensorById(db, 26408);
---

<div>
  <h1>Sensor {sensor?.segment_id}</h1>
  <p>Cars: {sensor?.car}</p>
  <p>Bikes: {sensor?.bike}</p>
</div>
```

### In an API route:

```typescript
import type { APIRoute } from 'astro';
import { getAllSensors } from '@/utils/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;
  const sensors = await getAllSensors(db);

  return new Response(JSON.stringify(sensors));
};
```

## Next Steps

1. Add more sensors by creating new migration files
2. Build UI components to visualize the sensor data
3. Add authentication if needed for PUT/DELETE operations
4. Set up scheduled tasks to fetch new data from Telraam API
5. Create map visualization using the geographic coordinates

## Documentation

- Full schema details: `db/README.md`
- Database utilities: `src/utils/db.ts`
- Claude Code guidance: `CLAUDE.md`
