# Update Sensor Data - Scheduled Worker

This Cloudflare Worker runs on a schedule (daily at 11:59 PM) to fetch the latest traffic data from the Telraam API and update the sensor data in the D1 database.

## What It Does

1. Runs automatically every night at 11:59 PM (23:59)
2. Fetches live traffic snapshot data from Telraam API for all sensors in Ireland
3. Updates existing sensors in the database with:
   - `bike` - Bicycle count
   - `heavy` - Heavy vehicle count
   - `car` - Car count
   - `pedestrian` - Pedestrian count
   - `uptime` - Sensor uptime percentage
   - `v85` - 85th percentile speed
   - `last_data_package` - Timestamp of last data update
   - `night` - Night traffic count (if available)
   - `updated_at` - Record update timestamp
4. Only updates sensors that already exist in the database (ignores new segments)

## Setup & Deployment

### 1. Install Dependencies

From the worker directory:

```bash
cd workers/update-sensor-data
npm install
```

### 2. Set Up the API Key Secret

The Telraam API key needs to be stored as a secret in Cloudflare (not in the code):

```bash
# From the worker directory
npx wrangler secret put TELRAAM_API_KEY
```

When prompted, enter the API key: `72DWFeBZGv5mi73uOcM6S1IlpUXbp5Zb6saWElGg`

This stores the key securely in Cloudflare and makes it available to the worker as `env.TELRAAM_API_KEY`.

### 3. Deploy the Worker

```bash
# From the worker directory
npm run deploy
```

This will:
- Build and deploy the worker to Cloudflare
- Set up the cron trigger to run at 11:59 PM daily
- Connect to the existing D1 database (`theride-db`)

## Testing

### Manual Trigger (Test Without Waiting for Cron)

You can manually trigger the worker to test it without waiting for the scheduled time:

```bash
# From the worker directory
npx wrangler dev --test-scheduled
```

Or trigger a deployed worker manually via the Cloudflare dashboard:
1. Go to Workers & Pages
2. Select `update-sensor-data`
3. Go to the "Triggers" tab
4. Click "Trigger Cron" to run it immediately

### View Logs

To see real-time logs from the deployed worker:

```bash
# From the worker directory
npm run tail
```

Or view logs in the Cloudflare dashboard under Workers & Pages > update-sensor-data > Logs.

### Check Database Updates

After running the worker, verify the updates in the database:

```bash
# From the project root
npx wrangler d1 execute theride-db --command "SELECT segment_id, bike, updated_at FROM sensor_locations ORDER BY updated_at DESC LIMIT 10"
```

## Schedule Configuration

The cron schedule is configured in `wrangler.toml`:

```toml
[triggers]
crons = ["59 23 * * *"]
```

This uses standard cron syntax:
- `59` = Minute (59)
- `23` = Hour (11 PM in 24-hour format)
- `*` = Every day of the month
- `*` = Every month
- `*` = Every day of the week

To change the schedule, modify this line and redeploy.

## Geographic Coverage

The worker fetches sensor data for all of Ireland using:
- **Center point**: -8.2439°W, 53.4129°N (geographic center of Ireland)
- **Radius**: 300 km (covers the entire island)

This is configured in the API request body:

```json
{
  "time": "live",
  "contents": "minimal",
  "area": "-8.2439,53.4129,300"
}
```

## Error Handling

- If a sensor doesn't exist in the database, it's skipped (not added)
- Errors for individual sensors are logged but don't stop the entire process
- Overall errors cause the scheduled run to be marked as failed in Cloudflare
- Check logs to monitor success/failure and see how many sensors were updated

## Monitoring

Key metrics logged on each run:
- Total number of sensor reports received from API
- Number of sensors in our database
- Number of matching sensors to update
- Batch processing progress
- Number of sensors updated/skipped
- Any errors encountered

Example log output:
```
Starting scheduled sensor data update...
Received 45 sensor reports from Telraam API
Database has 40 registered sensors
Found 38 matching sensors to update
Batch 1: Updated 38 sensors
Update complete: 38 sensors updated, 7 sensors skipped (not in database)
```

## Troubleshooting

### "Too many API requests by single worker invocation"

**Problem**: Worker fails with error about too many API requests.

**Cause**: Cloudflare Workers have a limit on the number of subrequests (database queries, API calls) that can be made in a single worker invocation. Making individual queries for each sensor (SELECT + UPDATE per sensor) quickly exceeds this limit.

**Solution** (IMPLEMENTED): The worker uses batching to avoid this limit:

1. **Bulk fetch**: Get all sensor IDs from the database in a single query
2. **In-memory filtering**: Filter Telraam data to only sensors we track (no per-sensor database lookups)
3. **Batch updates**: Group UPDATE queries in batches of 50 using `D1.batch()`

This reduces database operations from ~80 per run (40 sensors × 2 queries each) to ~3 per run (1 fetch + ~1-2 batch updates).

**Code pattern**:
```typescript
// Fetch all sensor IDs once
const { results: ourSegments } = await env.DB
  .prepare('SELECT segment_id FROM sensor_locations')
  .all<{ segment_id: number }>();

// Filter in memory
const ourSegmentIds = new Set(ourSegments.map(s => s.segment_id));
const relevantReports = data.features
  .map(f => f.properties)
  .filter(report => ourSegmentIds.has(report.segment_id));

// Batch updates (50 at a time)
const BATCH_SIZE = 50;
for (let i = 0; i < relevantReports.length; i += BATCH_SIZE) {
  const batch = relevantReports.slice(i, i + BATCH_SIZE);
  const statements = batch.map(report => /* create UPDATE statement */);
  await env.DB.batch(statements);
}
```

**How to verify the fix**:
1. Deploy the updated worker
2. Trigger manually via Cloudflare dashboard (Workers & Pages > update-sensor-data > Triggers > "Trigger Cron")
3. Check logs for batch processing messages
4. Verify no "Too many API requests" errors
