# Fix Cloudflare Subrequest Limit Error

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor update-sensor-data worker to stay within Cloudflare's 50 subrequest limit on free tier

**Current Problem:** Worker processes 40 sensors, making ~121+ subrequests:
- 1 cleanup query
- 40 sensors × (1 latest timestamp query + 1 Telraam API call + 1-N batch inserts)
- This exceeds the 50 subrequest limit

**Architecture Considerations:** Each of the following counts as a subrequest:
- D1 database queries (SELECT, INSERT, DELETE, batch operations)
- External fetch calls (Telraam API)
- Any other HTTP requests

---

## Option Analysis

### Option 1: Chunked Processing with State Tracking ⭐ RECOMMENDED

**Approach:** Process sensors in chunks of 8-10 per invocation, tracking progress in D1

**Pros:**
- ✅ Simple implementation - minimal code changes
- ✅ Works within free tier (8 sensors = ~25 subrequests)
- ✅ No additional Cloudflare services needed
- ✅ Existing retry/error handling still works
- ✅ All sensors processed within ~4-5 cron runs

**Cons:**
- ❌ Takes longer to complete full update cycle (4-5 hours if hourly cron)
- ❌ Adds state management complexity
- ❌ Need new DB table for tracking progress

**Subrequest Math:**
- 1 cleanup + 1 progress query + 8 sensors × (1 query + 1 API + 1 batch) = ~27 subrequests

---

### Option 2: Multiple Specialized Workers

**Approach:** Split 40 sensors across 4 workers (10 sensors each)

**Pros:**
- ✅ All sensors processed in parallel
- ✅ Simple - no state tracking needed
- ✅ Each worker stays within limit (10 sensors = ~32 subrequests)
- ✅ Failure isolation - one worker failing doesn't affect others

**Cons:**
- ❌ 4× the worker maintenance burden
- ❌ Need to manually partition sensor IDs
- ❌ Harder to add/remove sensors dynamically
- ❌ More wrangler.toml configs to manage

**Subrequest Math:**
- 1 cleanup + 10 sensors × (1 query + 1 API + 1 batch) = ~32 subrequests per worker

---

### Option 3: Cloudflare Queues with Single-Sensor Jobs

**Approach:** Queue each sensor as separate job, worker processes one at a time

**Pros:**
- ✅ Built-in retry and dead letter queue
- ✅ Scales elegantly to any number of sensors
- ✅ Can process multiple sensors concurrently
- ✅ Clean separation of concerns

**Cons:**
- ❌ Requires Cloudflare Queues (may have costs/limits on free tier)
- ❌ Significant architecture change
- ❌ More moving parts (producer worker + consumer worker)
- ❌ Learning curve for Queue API

**Subrequest Math:**
- Per job: 1 query + 1 API + 1 batch = ~3 subrequests (well within limit)

---

### Option 4: Reduce Queries via Caching

**Approach:** Fetch all sensor latest timestamps in one query, cache in memory

**Pros:**
- ✅ Reduces queries from 40 to 1
- ✅ Minimal code changes
- ✅ Immediate improvement

**Cons:**
- ❌ Still exceeds limit (1 cleanup + 1 bulk query + 40 APIs + 40 batches = ~83)
- ❌ Doesn't solve the fundamental problem
- ❌ Not viable as standalone solution

**Subrequest Math:**
- 1 cleanup + 1 bulk query + 40 APIs + 40 batches = ~83 subrequests (still over)

---

### Option 5: Upgrade to Cloudflare Paid Plan

**Approach:** Upgrade to Workers Paid ($5/month) for 1,000 subrequest limit

**Pros:**
- ✅ No code changes needed
- ✅ Immediate fix
- ✅ Supports scaling to 200+ sensors
- ✅ Other benefits (CPU time, memory)

**Cons:**
- ❌ Monthly cost ($5/month)
- ❌ Doesn't address architectural efficiency
- ❌ Not a technical solution

**Subrequest Math:**
- 121 subrequests << 1,000 limit (plenty of headroom)

---

## Recommendation: Option 1 (Chunked Processing) - SIMPLIFIED

For a free-tier project, **Option 1** provides the best balance:
- No additional costs
- **No state tracking needed** - uses existing hourly data to determine priority
- Scales to current sensor count
- Self-organizing - always processes sensors with oldest data first

**Key Simplification:** Instead of tracking progress in a separate table, query `sensor_hourly_data` to find the 8 sensors with oldest (or missing) data. Run frequently (every 1-5 minutes) so all sensors stay fresh.

If this project generates revenue or needs real-time updates, consider **Option 5** (paid plan) for simplicity.

---

## Implementation Plan (Option 1 - Simplified)

### Task 1: Update Cron Schedule for Frequent Runs

**Files:**
- Modify: `workers/update-sensor-data/wrangler.toml`

**Step 1: Read current cron schedule**

Run: `cat workers/update-sensor-data/wrangler.toml | grep -A 2 triggers`

Expected: See current schedule

**Step 2: Update to run every 5 minutes between midnight and 4am**

Find the triggers section and update to:

```toml
[triggers]
crons = ["*/5 0-4 * * *"]
```

This runs every 5 minutes from 00:00-04:59 UTC (60 runs per night).
With 40 sensors ÷ 8 per run = 5 runs needed, completing in ~25 minutes.

Alternative (more aggressive): `["* 0-4 * * *"]` for every minute.

**Step 3: Commit**

```bash
git add workers/update-sensor-data/wrangler.toml
git commit -m "feat: update worker to run every 5 minutes for faster sensor updates"
```

---

### Task 2: Add Chunk Size Configuration

**Files:**
- Modify: `workers/update-sensor-data/index.ts:21-24`

**Step 1: Add configuration constant**

Add after the Env interface (around line 24):

```typescript
// Configuration
const CHUNK_SIZE = 8; // Process 8 sensors per invocation (stays under 50 subrequests)
```

**Step 2: Commit**

```bash
git add workers/update-sensor-data/index.ts
git commit -m "feat: add chunk size configuration for subrequest limit"
```

---

### Task 3: Add Function to Get Sensors with Oldest Data

**Files:**
- Modify: `workers/update-sensor-data/index.ts:377-420` (after sleep function)

**Step 1: Add getSensorsNeedingUpdate function**

Add after the sleep function:

```typescript
/**
 * Get sensors with oldest data (or no data) that need updating
 * Returns up to CHUNK_SIZE sensors, prioritizing:
 * 1. Sensors with no data (NULL hour_timestamp)
 * 2. Sensors with oldest hour_timestamp
 *
 * This creates a self-organizing priority queue - sensors naturally
 * get processed based on data freshness without external state tracking.
 */
async function getSensorsNeedingUpdate(db: D1Database, chunkSize: number): Promise<SensorLocation[]> {
  const { results } = await db
    .prepare(`
      SELECT
        sl.segment_id,
        sl.timezone,
        MAX(shd.hour_timestamp) as latest_hour
      FROM sensor_locations sl
      LEFT JOIN sensor_hourly_data shd ON sl.segment_id = shd.segment_id
      GROUP BY sl.segment_id, sl.timezone
      ORDER BY latest_hour ASC NULLS FIRST
      LIMIT ?
    `)
    .bind(chunkSize)
    .all<SensorLocation & { latest_hour: string | null }>();

  if (!results || results.length === 0) {
    return [];
  }

  // Log which sensors we selected and why
  const now = new Date();
  results.forEach((sensor, idx) => {
    if (!sensor.latest_hour) {
      console.log(`  ${idx + 1}. Sensor ${sensor.segment_id}: No data yet (never fetched)`);
    } else {
      const age = now.getTime() - new Date(sensor.latest_hour).getTime();
      const hoursOld = (age / (1000 * 60 * 60)).toFixed(1);
      console.log(`  ${idx + 1}. Sensor ${sensor.segment_id}: Data ${hoursOld}h old (${sensor.latest_hour})`);
    }
  });

  return results;
}
```

**Step 2: Commit**

```bash
git add workers/update-sensor-data/index.ts
git commit -m "feat: add function to prioritize sensors with oldest data"
```

---

### Task 4: Refactor Main Loop to Use Priority-Based Selection

**Files:**
- Modify: `workers/update-sensor-data/index.ts:62-85`

**Step 1: Update sensor fetching logic**

Replace lines 62-85 (from "Step 1: Clean up data" through "const processedSensors") with:

```typescript
      // Step 1: Clean up data older than 7 days
      await cleanupOldData(env.DB);

      // Step 2: Get sensors with oldest data (or no data at all)
      console.log(`🔍 Finding ${CHUNK_SIZE} sensors with oldest data...`);
      const sensors = await getSensorsNeedingUpdate(env.DB, CHUNK_SIZE);

      if (sensors.length === 0) {
        console.log('✅ All sensors up to date - nothing to do');
        return;
      }

      console.log(`📦 Processing ${sensors.length} sensors`);

      // Step 3: Process selected sensors
      const currentHourDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      let totalHoursInserted = 0;
      let sensorsUpdated = 0;
      let sensorsSkipped = 0;
      let sensorsErrored = 0;
      const processedSensors: number[] = [];
```

**Step 2: Update final summary section**

Replace lines 164-175 (the summary console.log section) with:

```typescript
      const totalDuration = Date.now() - startTime;
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Batch complete in ${(totalDuration / 1000).toFixed(1)}s`);
      console.log(`  Sensors processed: ${sensorsUpdated}`);
      console.log(`  Sensors skipped (up to date): ${sensorsSkipped}`);
      console.log(`  Sensors errored: ${sensorsErrored}`);
      console.log(`  Hours inserted: ${totalHoursInserted}`);
      if (processedSensors.length > 0) {
        console.log(`  Successfully processed IDs: ${processedSensors.join(', ')}`);
      }
      console.log(`${'='.repeat(70)}`);
```

**Step 3: Commit**

```bash
git add workers/update-sensor-data/index.ts
git commit -m "refactor: use priority-based sensor selection to stay under subrequest limit"
```

---

### Task 5: Update Worker Documentation

**Files:**
- Modify: `workers/update-sensor-data/index.ts:1-15`

**Step 1: Update header documentation**

Replace lines 1-15 with:

```typescript
/**
 * Update Sensor Data Worker
 *
 * Incrementally fetches hourly traffic data from Telraam API for all sensors.
 *
 * Design:
 * - Chunked processing: Processes 8 sensors per invocation to stay under Cloudflare's
 *   50 subrequest limit (free tier)
 * - Priority-based: Automatically selects sensors with oldest data (or no data)
 * - Self-organizing: No external state tracking - uses existing hourly data table
 * - Frequent runs: Runs every 5 minutes (00:00-04:00 UTC) for fast updates
 * - Per-sensor incremental: Fetches from latest DB timestamp to now for each sensor
 * - Rate limited: 5s between API calls to respect Telraam limits
 * - Upsert pattern: Safe to re-run without duplicating data
 * - 7-day retention: Automatically cleans up old hourly data
 * - Early exit: Stops immediately if all sensors are up to date
 *
 * Each sensor independently determines its fetch range based on
 * its latest hour_timestamp in the sensor_hourly_data table.
 *
 * Subrequest Budget (Free Tier = 50):
 * - 1 cleanup query
 * - 1 priority selection query (LEFT JOIN to find oldest data)
 * - 8 sensors × (1 latest timestamp query + 1 Telraam API call + 1-2 batch inserts)
 * - Total: ~27-35 subrequests per invocation
 */
```

**Step 2: Commit**

```bash
git add workers/update-sensor-data/index.ts
git commit -m "docs: update worker documentation for priority-based processing"
```

---

### Task 6: Add README for Workers

**Files:**
- Create: `workers/update-sensor-data/README.md`

**Step 1: Create comprehensive README**

```markdown
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
```

**Step 2: Commit**

```bash
git add workers/update-sensor-data/README.md
git commit -m "docs: add comprehensive README for priority-based worker"
```

---

### Task 7: Test Locally

**Files:** N/A (verification only)

**Step 1: Verify TypeScript compiles**

Run: `cd workers/update-sensor-data && npx wrangler dev -c wrangler.toml`

Expected: Worker starts without errors, press X to exit

**Step 2: Test priority query locally**

Run:
```bash
npx wrangler d1 execute theride-db --local --command "
SELECT sl.segment_id, sl.timezone, MAX(shd.hour_timestamp) as latest_hour
FROM sensor_locations sl
LEFT JOIN sensor_hourly_data shd ON sl.segment_id = shd.segment_id
GROUP BY sl.segment_id, sl.timezone
ORDER BY latest_hour ASC NULLS FIRST
LIMIT 8"
```

Expected: Returns 8 sensors with oldest data or NULL

**Step 3: Manual trigger test (if available)**

If you have test trigger ability, verify:
- First run processes 8 sensors with oldest/no data
- Second run processes next 8 oldest sensors
- Worker exits early if all sensors up to date

**Step 4: No commit (verification only)**

---

### Task 8: Deploy and Monitor

**Files:** N/A (deployment only)

**Step 1: Deploy worker**

Run: `cd workers/update-sensor-data && npm run deploy`

Expected: Deployment successful message

**Step 2: Monitor first execution**

Run: `cd workers/update-sensor-data && npm run tail`

Wait for scheduled trigger (or manually trigger in dashboard), watch for:
- `🔍 Finding 8 sensors with oldest data...`
- `📦 Processing N sensors`
- `Sensor X: Data Yh old` or `No data yet`
- `✅ Successfully processed`
- No "Too many subrequests" errors

**Step 3: Verify sensor data freshness**

Run:
```bash
npx wrangler d1 execute theride-db --command "
SELECT segment_id, MAX(hour_timestamp) as latest, COUNT(*) as hours
FROM sensor_hourly_data
GROUP BY segment_id
ORDER BY latest DESC
LIMIT 10"
```

Expected: Recently updated sensors at top

**Step 4: Commit deployment notes**

```bash
git add -A
git commit -m "chore: deploy priority-based sensor processing worker"
```

---

## Success Criteria

- ✅ Worker runs without "Too many subrequests" errors
- ✅ Priority selection works (sensors with oldest data selected first)
- ✅ All 40 sensors updated within ~25 minutes (5 runs)
- ✅ Worker exits early when all sensors up to date (no wasted runs)
- ✅ Hourly data continues to be fetched correctly
- ✅ No state tracking needed (self-organizing via existing data)

## Future Enhancements

If sensor count grows beyond 50:
1. Reduce CHUNK_SIZE to 6 or 4
2. Increase cron frequency (every 1 minute instead of 5)
3. Consider Option 2 (Multiple Workers) for parallel processing
4. Consider Option 5 (Paid Plan) for 1,000 subrequest limit
