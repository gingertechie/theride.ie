# Update Sensor Data Worker

Scheduled Cloudflare Worker that fetches hourly traffic data from Telraam API for all sensors.

## How It Works

### Priority-Based Chunked Processing

To stay within Cloudflare's 50 subrequest limit (free tier), the worker uses a self-organizing approach:

- **Chunk size:** 8 sensors per invocation
- **Priority selection:** Automatically selects sensors with oldest data (or no data)
- **No state tracking:** Uses existing `sensor_hourly_data` table to determine priority
- **Frequent runs:** Every 5 minutes (00:00-04:00 UTC) for fast updates
- **Self-healing:** Sensors with gaps naturally get higher priority

### Processing Flow

1. **Clean Up:** Delete hourly data older than 7 days
2. **Select Priority Sensors:** Query for 8 sensors with oldest `hour_timestamp` (or NULL)
3. **Early Exit:** If all sensors up to date, worker exits immediately
4. **Process Each Sensor:**
   - Query latest timestamp from `sensor_hourly_data`
   - Fetch new data from Telraam API (with 5s rate limiting)
   - Insert hourly data in batches of 50

### Subrequest Budget

Each invocation uses ~27-35 subrequests:

- 1 cleanup query
- 1 priority selection query (LEFT JOIN)
- 8 sensors × 3 subrequests each:
  - 1 query for latest timestamp
  - 1 Telraam API call
  - 1 batch insert (typically 1 batch per sensor)

**Total:** ~27 subrequests (well under 50 limit)

## Schedule

Runs every 5 minutes from 00:00-04:00 UTC (60 runs per night).

With 40 sensors ÷ 8 per run = 5 runs needed, completing in ~25 minutes.

```toml
[triggers]
crons = ["*/5 0-4 * * *"]
```

## Configuration

```typescript
const CHUNK_SIZE = 8;  // Sensors per invocation (tune for subrequest budget)
```

## Why This Works

The priority query creates a **self-organizing queue**:

```sql
SELECT sl.segment_id, sl.timezone, MAX(shd.hour_timestamp) as latest_hour
FROM sensor_locations sl
LEFT JOIN sensor_hourly_data shd ON sl.segment_id = shd.segment_id
GROUP BY sl.segment_id, sl.timezone
ORDER BY latest_hour ASC NULLS FIRST  -- NULL (never fetched) comes first
LIMIT 8
```

- Sensors never fetched (NULL) get highest priority
- Sensors with oldest data come next
- Recently updated sensors naturally pushed to back
- No manual state tracking or reset logic needed

## Development

```bash
# Local development with test triggers
npm run dev

# Deploy to production
npm run deploy

# View production logs
npm run tail

# Manually trigger (Cloudflare dashboard)
# Workers & Pages > update-sensor-data > Triggers > Cron Triggers > "Send test event"
```

## Monitoring

Check logs for:
- `🔍 Finding 8 sensors with oldest data...` - Priority selection
- `📦 Processing N sensors` - How many sensors selected
- `✅ All sensors up to date` - Nothing to do (early exit)
- `Sensor X: Data Yh old` - Data freshness for each sensor
- Subrequest errors - May need to reduce CHUNK_SIZE

## Troubleshooting

### "Too many subrequests" error

Reduce `CHUNK_SIZE` constant:
- Current: 8 sensors (~27 subrequests)
- Try: 6 sensors (~21 subrequests)
- Minimum viable: 4 sensors (~15 subrequests)

### Sensors not updating

Check:
1. Cron schedule is running (Cloudflare dashboard)
2. Last successful run in logs
3. Query to see sensor data freshness:
   ```sql
   SELECT segment_id, MAX(hour_timestamp) as latest
   FROM sensor_hourly_data
   GROUP BY segment_id
   ORDER BY latest ASC;
   ```
4. Telraam API key valid
