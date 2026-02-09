# Weekly Stats Aggregation Worker

Scheduled Cloudflare Worker that aggregates hourly sensor data into weekly statistics for fast chart rendering.

## Schedule

- Runs every **Sunday at 3:00 AM UTC**
- Aggregates the **previous complete week** (Sunday to Saturday)

## What It Does

1. Calculates the date range for the previous week (Sunday 00:00 to Saturday 23:59)
2. Deletes any existing records for that week (for idempotent re-runs)
3. Aggregates hourly bike counts from `sensor_hourly_data` by sensor and county
4. Inserts weekly totals into `sensor_weekly_stats` table

## Database Tables

**Input**: `sensor_hourly_data`
- Detailed hourly traffic counts per sensor

**Output**: `sensor_weekly_stats`
- One row per sensor per week
- Includes: `week_ending`, `segment_id`, `county`, `total_bikes`, `avg_daily`

## Testing

### Date Logic Test

Run the date calculation test to verify week boundaries:

```bash
node test-date-logic.js
```

This test verifies that when running on any Sunday, the worker correctly identifies the previous week's Sunday-to-Saturday date range.

### Manual Trigger

To trigger the worker manually (without waiting for Sunday):

1. Go to Cloudflare Dashboard
2. Navigate to: **Workers & Pages** → `aggregate-weekly-stats`
3. Go to **Triggers** → **Cron Triggers**
4. Click **"Send test event"**
5. Check logs with: `npm run tail`

### Local Testing

The worker doesn't support local testing with `wrangler dev` because scheduled workers need to be triggered via cron or manual test events.

## Deployment

```bash
npm run deploy
```

**Important**: Always use `npm run deploy` (which includes `-c wrangler.toml`) to avoid deploying the wrong project.

## Monitoring

View production logs:

```bash
npm run tail
```

Check if weekly stats are being generated:

```bash
npx wrangler d1 execute theride-db --remote --command "SELECT COUNT(*) as weeks, MIN(week_ending) as oldest, MAX(week_ending) as newest FROM sensor_weekly_stats"
```

## Known Issues

- Initial deployment starts from scratch (no historical backfill)
- Takes 52 weeks to accumulate full year of data for charts
- Consider creating a one-time backfill script for historical data
