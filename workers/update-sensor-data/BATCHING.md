# Worker Batching Implementation

## Problem

The `update-sensor-data` worker was only processing the first ~44-50 sensors (up to segment_id 9000009071) and never reaching newer sensors (like 9000009735 added on Dec 1st).

**Root Cause:**
- 73 sensors with 5-second API delays = 6+ minutes execution time
- Worker likely hitting timeout/limits before completing all sensors
- Query lacked `ORDER BY`, making sensor processing order non-deterministic
- No visibility into which sensors were being processed

## Solution

Implemented batch processing with three key improvements:

### 1. Deterministic Ordering
Added `ORDER BY segment_id ASC` to ensure sensors are always processed in the same order.

### 2. Batch Processing
- Split 73 sensors into 5 batches of 15 sensors each (last batch has 13)
- Each batch processes in ~75 seconds (15 sensors × 5 sec)
- Worker runs hourly between midnight and 4am UTC only
- All sensors updated nightly in 5-hour window

**Nightly Schedule (midnight-4am UTC):**
- Hour 00:00 → Batch 1 (sensors 1-15)
- Hour 01:00 → Batch 2 (sensors 16-30)
- Hour 02:00 → Batch 3 (sensors 31-45)
- Hour 03:00 → Batch 4 (sensors 46-60)
- Hour 04:00 → Batch 5 (sensors 61-73)
- Worker idle rest of the day

### 3. Comprehensive Logging
Added detailed logging at every stage:
- Batch information (which batch, which sensors)
- Per-sensor progress with timing
- API call duration
- Database insert duration
- Summary statistics (updated/skipped/errored)
- Execution time tracking

**Sample Log Output:**
```
[2026-01-31T14:00:00Z] Starting scheduled sensor data update...
Total sensors in database: 73
Batch processing: batch 2/5 (sensors 16-30 of 73)
Processing 15 sensors in this batch
Sensor IDs in batch: 9000001015, 9000001016, ...

[Sensor 1/15] Processing segment_id: 9000001015
  Last data: 2026-01-30T12:00:00Z, fetching from 2026-01-30T13:00:00Z
  Waiting 5s before API call...
  API call completed in 1234ms, returned 4 records
  ✅ Inserted 4 hours in 567ms (total sensor time: 6801ms)

...

======================================================================
Batch 2 complete in 76.3s
  Sensors updated: 12
  Sensors skipped (up to date): 2
  Sensors errored: 1
  Total hours inserted: 48
  Successfully processed IDs: 9000001015, 9000001016, ...
======================================================================
```

## Configuration

**Adjustable Parameters** (in `index.ts`):
```typescript
const SENSORS_PER_BATCH = 15;              // Sensors per run
const BATCH_SCHEDULE = [0, 1, 2, 3, 4];   // Hours to run (midnight-4am)
```

**Cron Schedule** (in `wrangler.toml`):
```toml
crons = ["0 0,1,2,3,4 * * *"]  # Hourly between midnight-4am UTC
```

## Benefits

1. **Reliability**: No sensor is left behind due to timeouts
2. **Observability**: Detailed logs show exactly what's happening
3. **Scalability**: Easy to add more sensors (batches auto-adjust)
4. **Efficiency**: Each run completes quickly (~75 seconds)
5. **Determinism**: Sensors always processed in same order

## Testing

Run `npm run test-batching` (or `npx tsx test-batching.ts`) to simulate the batch schedule and verify all sensors are covered.

## Deployment

```bash
cd workers/update-sensor-data
npm run deploy
```

## Monitoring

After deployment, check logs to verify batching is working:
```bash
npm run tail
```

You should see batch numbers 1-5 running sequentially each night between midnight-4am UTC. The worker will be idle during other hours.
