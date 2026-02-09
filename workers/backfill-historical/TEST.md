# Testing Backfill Worker Locally

This guide helps you test the backfill worker locally with minimal API impact.

## Current Test Configuration

The `wrangler.toml` is configured for safe local testing:

- **BATCH_SIZE: 2** - Only processes 2 sensors
- **BACKFILL_DAYS: 7** - Only fetches 1 week of data (not 90 days)
- **Total API calls: 2** (one per sensor)
- **Time: ~10 seconds** (with 5s delay between calls)

## Prerequisites

1. **Set your Telraam API key:**
   ```bash
   export TELRAAM_API_KEY='your-api-key-here'
   ```

2. **Ensure local database has sensor data:**
   ```bash
   # Check if sensors exist
   npx wrangler d1 execute theride-db --local --command \
     'SELECT COUNT(*) as count FROM sensor_locations LIMIT 1'

   # If empty, seed from production:
   npx wrangler d1 execute theride-db --local \
     --file=../../db/migrations/0001_seed_sensor_locations.sql
   ```

## Option 1: Quick Test (Recommended)

Run the worker once with test settings:

```bash
npm test
```

When the dev server starts, it will prompt you to trigger the scheduled event. Just press `Enter` or `b` to trigger it.

You'll see output like:
```
Starting backfill worker...
📊 Configuration: backfill 7 days before oldest data, batch size: 2
📦 Total sensors: 40

🔄 [1/2] Sensor 9000001435...
   Oldest data: 2025-11-11 00:00:00Z
   Fetching 7 days before that
   📅 Range: 2025-11-04 00:00:00Z to 2025-11-11 00:00:00Z
   ✅ Inserted 168 hours (168 fetched)

⏳ Batch complete in 8.2s
  Sensors backfilled: 2
  Hours inserted: 336
```

## Option 2: Manual Trigger

If you want more control:

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **In another terminal, trigger the scheduled event:**
   ```bash
   curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'
   ```

## Option 3: Use Test Script

Run the interactive test script:

```bash
./test-local.sh
```

This will:
- Check your API key is set
- Show current database state
- Run the worker with test settings
- Show results

## Verify Results

After running, check what data was inserted:

```bash
# See what sensors were backfilled
npx wrangler d1 execute theride-db --local --command \
  'SELECT segment_id, MIN(hour_timestamp) as oldest, MAX(hour_timestamp) as newest, COUNT(*) as hours
   FROM sensor_hourly_data
   GROUP BY segment_id
   ORDER BY segment_id
   LIMIT 5'
```

## Expected Behavior

**First run (no existing data):**
- Fetches last 7 days for 2 sensors
- Inserts ~168 hours per sensor (7 days × 24 hours)
- Total: ~336 hours inserted

**Second run (has existing data):**
- Finds oldest data (e.g., Nov 11)
- Fetches 7 days BEFORE that (Nov 4-10)
- Inserts another ~168 hours per sensor

**Third run:**
- Oldest is now Nov 4
- Fetches Oct 28 - Nov 3
- Continues progressively backward

## When You're Ready for Production

1. **Update settings in `wrangler.toml`:**
   ```toml
   [vars]
   BATCH_SIZE = "5"       # Back to 5 sensors per run
   BACKFILL_DAYS = "90"   # Full 90-day backfill
   ```

2. **Deploy:**
   ```bash
   npm run deploy
   ```

3. **Monitor first production run:**
   ```bash
   npm run tail
   ```

## Troubleshooting

**"No active sensors found":**
- Your local DB is empty
- Run the seed migration (see Prerequisites)

**"TELRAAM_API_KEY not set":**
- Export the environment variable before running

**Rate limit errors (429):**
- Even with 2 sensors, you might hit limits if running repeatedly
- Wait a few minutes between test runs
- Consider using `BATCH_SIZE=1` for testing

**No data returned from API:**
- Sensor might not have historical data available
- Try a different sensor or date range
- Check Telraam website to verify sensor has data
