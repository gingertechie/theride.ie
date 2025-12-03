# Location Name Scraper Worker

Scheduled Cloudflare Worker that scrapes human-readable location names from Telraam sensor pages and populates the `location_name` column in the database.

## Schedule

Runs every **Sunday at 2:00 AM UTC** (weekly maintenance window).

## Behavior

1. Queries for sensors where `location_name IS NULL`
2. Fetches each sensor's Telraam page: `https://telraam.net/en/location/{segment_id}`
3. Extracts location name from `<h1>` tag using regex
4. Updates `sensor_locations.location_name` column
5. Rate limits to 3 seconds between requests

## Rate Limiting

- **3 second delay** between requests to avoid overwhelming Telraam servers
- Sleeps BEFORE each fetch (including the first one)
- Respects Telraam as a small non-profit

## Error Handling

- **404 Not Found**: Stores NULL, logs as "skipped"
- **Network Errors**: Logs error, will retry next week
- **Parse Errors**: Stores NULL, logs as warning
- **Database Errors**: Throws error to trigger alert

All errors are caught per sensor, so processing continues for remaining sensors.

## Commands

### Deploy to Production
```bash
cd workers/scrape-location-names
npm run deploy
# OR manually:
npx wrangler deploy -c wrangler.toml
```

**Note**: Always use `-c wrangler.toml` flag to avoid deploying the root project's worker instead.

### View Logs
```bash
npm run tail
# OR manually:
npx wrangler tail scrape-location-names
```

### Trigger Manual Run (for testing)
```bash
# Don't wait for Sunday - trigger immediately via Cloudflare dashboard
# Workers & Pages > scrape-location-names > Triggers > Cron Triggers > "Send test event"
```

### Local Development
```bash
npm run dev
# OR manually:
npx wrangler dev -c wrangler.toml --test-scheduled
```

## Database Queries

### Check Progress
```sql
SELECT
  COUNT(*) as total_sensors,
  COUNT(location_name) as sensors_with_names,
  ROUND(COUNT(location_name) * 100.0 / COUNT(*), 2) as percent_complete
FROM sensor_locations;
```

### View Recent Updates
```sql
SELECT segment_id, location_name, county, updated_at
FROM sensor_locations
WHERE location_name IS NOT NULL
ORDER BY updated_at DESC
LIMIT 10;
```

### Find Sensors Without Names
```sql
SELECT segment_id, county, latitude, longitude
FROM sensor_locations
WHERE location_name IS NULL;
```

### Reset Specific Sensor (to force re-scrape)
```sql
UPDATE sensor_locations
SET location_name = NULL
WHERE segment_id = 9000002783;
```

## Implementation Details

### HTML Parsing
- **Target**: `<h1>Location Name</h1>` tag
- **Method**: Regex pattern `/<h1>(.*?)<\/h1>/`
- **Entity Decoding**: Handles `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#039;`, `&apos;`

### Performance
- **Sequential Processing**: One sensor at a time due to rate limiting
- **Timeout**: 30 seconds per HTTP request
- **No Batch Limit**: Processes all sensors with NULL location names

### Update Logic
- Only updates sensors with `location_name IS NULL`
- Skips sensors that already have a name
- Can manually set to NULL to force re-scrape

## Monitoring

Monitor in Cloudflare dashboard:
- Worker execution logs
- Error rates
- CPU time usage
- Request counts

## Troubleshooting

### Worker Not Running
Check cron schedule is configured:
```bash
wrangler deployments list
```

### No Location Names Being Populated
1. Check worker logs: `wrangler tail scrape-location-names`
2. Verify sensors exist with NULL names: Run "Find Sensors Without Names" query
3. Test manual scrape of a specific sensor URL

### Rate Limiting (429 Errors)
- Worker already uses 3-second delays
- If still seeing 429s, increase delay in `sleep()` call
- Check Telraam server status

## Related Files

- `db/migrations/0006_add_location_name.sql` - Database migration
- `workers/update-sensor-data/` - Similar worker pattern for hourly data
