# Backfill Historical Worker - Deployment Guide

## Overview

This worker **progressively backfills** historical Telraam sensor data by working backward in time. For each sensor, it finds the oldest existing data and fetches N days before that, avoiding duplicate API calls and intelligently filling gaps.

## Configuration

Environment variables are now set in `wrangler.toml`:

- **`BATCH_SIZE`** (default: `5`)
  - Number of sensors to process per cron run
  - Smaller batch = fewer API calls = lower rate limit risk
  - Current: `5` sensors per run with 5-second delays = ~25 seconds per batch

- **`BACKFILL_DAYS`** (default: `90`)
  - How many days to fetch **before** each sensor's oldest data
  - Example: If sensor's oldest data is Nov 11, fetch Aug 13 → Nov 10
  - Progressively fills backward over multiple runs

- **`TELRAAM_API_KEY`** (required)
  - Set in Cloudflare dashboard (Workers & Pages > Settings > Variables > Environment Variables)
  - Your Telraam API key

## Deployment

From the worker directory:

```bash
cd workers/backfill-historical
npm run deploy
```

**Important**: The `-c wrangler.toml` flag is included in the npm script to avoid deploying the main site by mistake.

## Enabling the Cron Schedule

The cron schedule is **disabled by default** in `wrangler.toml`. Enable it via the Cloudflare dashboard:

1. Go to **Workers & Pages** > **backfill-historical**
2. Click **Triggers** tab
3. Under **Cron Triggers**, click **Add Cron Trigger**
4. Recommended schedule: `*/2 * * * *` (every 2 minutes)
   - With 73 sensors and `BATCH_SIZE=10`, this completes all sensors in ~15 minutes

## How It Works

### Smart Progressive Backfill

1. **Each run**:
   - Queries all sensors with their oldest `hour_timestamp`
   - Selects first `BATCH_SIZE` sensors (ordered by segment_id for consistency)
   - For each sensor:
     - **If no data exists**: Fetch last `BACKFILL_DAYS` days
     - **If data exists**: Fetch `BACKFILL_DAYS` days **before** oldest timestamp
   - Inserts data (uses UPSERT, safe to re-run)
   - 5-second delay between API calls to respect rate limits

2. **Progression**: Over multiple runs, each sensor's "oldest data" moves backward in time, progressively filling the historical gap

3. **Automatic completion**: When a sensor has no more historical data available (API returns empty), it's automatically skipped

### Example Timeline

With 73 sensors, `BATCH_SIZE=5`, and `*/30 * * * *` cron (every 30 minutes):

**Run 1 (3:00 PM):**
- Sensor 9000001435: oldest = Nov 11 → fetch Aug 13 to Nov 10
- Sensor 9000001437: oldest = Nov 11 → fetch Aug 13 to Nov 10
- ... (5 total)

**Run 2 (3:30 PM):**
- Sensor 9000001435: oldest = Aug 13 → fetch May 15 to Aug 12
- Sensor 9000001437: oldest = Aug 13 → fetch May 15 to Aug 12
- ... continues backward

## Monitoring

### View Logs

```bash
cd workers/backfill-historical
npm run tail
```

### Expected Log Output

```
📊 Configuration: backfill 90 days before oldest data, batch size: 5
📦 Total sensors: 73

🔄 [1/5] Sensor 9000001435...
   Oldest data: 2025-11-11 00:00:00Z
   Fetching 90 days before that
   📅 Range: 2025-08-13 00:00:00Z to 2025-11-10 23:00:00Z
   ✅ Inserted 2136 hours (2136 fetched)

⏳ Batch complete in 32.4s
  Sensors backfilled: 5
  Sensors skipped: 0
  Sensors errored: 0
  Hours inserted: 10680
```

### Check Progress

See oldest data per sensor:

```bash
npx wrangler d1 execute theride-db --remote --command \
  "SELECT segment_id, MIN(hour_timestamp) as oldest, MAX(hour_timestamp) as newest, COUNT(*) as hours FROM sensor_hourly_data GROUP BY segment_id ORDER BY oldest ASC LIMIT 10"
```

## Troubleshooting

### "Too many subrequests" error

- **Reduce `BATCH_SIZE`**: Change in `wrangler.toml` and redeploy
- **Check retries**: Each failed request retries up to 3 times

### Rate limit errors (429)

- **Current config is conservative**: 5 sensors × 5 second delays = 10 requests/hour
- If still hitting limits, increase cron interval (e.g., every 60 minutes instead of 30)

### Want to skip a sensor

The worker is stateless - just add a `WHERE segment_id != 9000001234` filter to the query in code

### Check what data exists

```bash
# See data coverage per sensor
npx wrangler d1 execute theride-db --remote --command \
  "SELECT segment_id, MIN(hour_timestamp) as oldest, MAX(hour_timestamp) as newest, COUNT(*) as hours FROM sensor_hourly_data GROUP BY segment_id"
```

## Architecture Notes

- **Stateless**: No progress table needed - the data itself determines what to fetch next
- **Self-organizing**: Sensors with oldest data naturally get priority
- **Idempotent**: INSERT with `ON CONFLICT DO UPDATE` means re-running is safe
- **Progressive**: Each run fills further back in time until API has no more data
