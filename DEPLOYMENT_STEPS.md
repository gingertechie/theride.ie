# Deployment Steps: Exponential Backoff Implementation

## Pre-Deployment Checklist

- [x] Migration file created: `db/migrations/0008_add_zero_result_tracking.sql`
- [x] Schema documented: `db/schema.sql`
- [x] Worker code updated: `workers/update-sensor-data/index.ts`
- [x] Documentation updated: `workers/update-sensor-data/README.md`
- [x] Local database migration tested successfully

## Deployment Sequence

### Step 1: Apply Database Migration to Production

```bash
cd /Users/gingertechie/dev/theride.ie
npx wrangler d1 execute theride-db --remote --file=./db/migrations/0008_add_zero_result_tracking.sql
```

**Expected Output:** 5 commands executed successfully

**Verify:**
```bash
npx wrangler d1 execute theride-db --remote --command "PRAGMA table_info(sensor_locations);" | grep -E "(last_zero_result_at|consecutive_zero_count|status)"
```

### Step 2: Deploy Worker

```bash
cd workers/update-sensor-data
npm run deploy
```

**Expected Output:**
```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Worker Startup Time: XX ms
Your worker has access to the following bindings:
- D1 Databases:
  - DB: theride-db (...)
Uploaded update-sensor-data (X.XX sec)
Deployed update-sensor-data triggers (X.XX sec)
  https://update-sensor-data.<account>.workers.dev
Current Version ID: <version-id>
```

### Step 3: Monitor First Runs

```bash
cd workers/update-sensor-data
npm run tail
```

**Watch for:**
- ✅ "Finding 8 sensors with oldest data..." (reduced from 20)
- ✅ Sensors showing backoff status: "(failures: 0, never failed)"
- ✅ "No new data available - recording zero result" for inactive sensors
- ✅ "Reset failure counter (sensor recovered)" for active sensors
- ❌ No "too many subrequests" errors

### Step 4: Verify Database State (After 1 Hour)

**Check active sensors getting fresh data:**
```bash
npx wrangler d1 execute theride-db --remote --command "
  SELECT segment_id, MAX(hour_timestamp) as latest
  FROM sensor_hourly_data
  WHERE hour_timestamp >= '2026-02-06'
  GROUP BY segment_id
  ORDER BY latest DESC
  LIMIT 10;
"
```

**Check failure tracking:**
```bash
npx wrangler d1 execute theride-db --remote --command "
  SELECT segment_id, consecutive_zero_count, status,
    CASE
      WHEN consecutive_zero_count < 3 THEN 'no backoff'
      WHEN consecutive_zero_count < 6 THEN '1h backoff'
      WHEN consecutive_zero_count < 11 THEN '6h backoff'
      ELSE '24h backoff'
    END as backoff_tier
  FROM sensor_locations
  WHERE consecutive_zero_count > 0
  ORDER BY consecutive_zero_count DESC
  LIMIT 10;
"
```

### Step 5: Verify Website (After 4-6 Hours)

1. Visit https://theride.ie/
2. Check that data shows 2026-02-06 or later
3. Check county pages show recent bike counts
4. Verify sensor detail pages have current data

## Success Criteria

### After 1 Hour
- [ ] Worker logs show 8 sensors being processed per run
- [ ] Active sensors show "Reset failure counter"
- [ ] Inactive sensors show "recording zero result"
- [ ] No subrequest errors in logs

### After 24 Hours
- [ ] Active sensors have fresh data (2026-02-06+)
- [ ] Inactive sensors have `consecutive_zero_count >= 6`
- [ ] Website displays current data
- [ ] No sensors stuck in infinite retry loop

## Rollback Plan

If issues occur:

```bash
# 1. Revert worker code
cd /Users/gingertechie/dev/theride.ie/workers/update-sensor-data
git checkout HEAD~1 index.ts
npm run deploy

# 2. (Optional) Remove migration columns
npx wrangler d1 execute theride-db --remote --command "
  ALTER TABLE sensor_locations DROP COLUMN last_zero_result_at;
  ALTER TABLE sensor_locations DROP COLUMN consecutive_zero_count;
  ALTER TABLE sensor_locations DROP COLUMN status;
  DROP INDEX IF EXISTS idx_sensor_last_zero;
  DROP INDEX IF EXISTS idx_sensor_status;
"
```

## Expected Behavior After Fix

1. **First run:** Worker selects 8 sensors (mix of null and oldest data)
2. **Inactive sensors:** Return 0 records, failure counter increments
3. **Active sensors:** Return data, get inserted, failure counter resets
4. **Second run:** Inactive sensors with <3 failures still tried
5. **After 3+ failures:** Sensors enter backoff, removed from queue for 1h/6h/24h
6. **Result:** Active sensors processed every 5 minutes, inactive sensors gradually deprioritized

## Monitoring Commands

**Watch live logs:**
```bash
cd workers/update-sensor-data
npm run tail
```

**Check sensor status:**
```bash
npx wrangler d1 execute theride-db --remote --command "
  SELECT
    COUNT(CASE WHEN consecutive_zero_count = 0 THEN 1 END) as active_sensors,
    COUNT(CASE WHEN consecutive_zero_count BETWEEN 1 AND 2 THEN 1 END) as failing_1_2,
    COUNT(CASE WHEN consecutive_zero_count BETWEEN 3 AND 5 THEN 1 END) as backoff_1h,
    COUNT(CASE WHEN consecutive_zero_count BETWEEN 6 AND 10 THEN 1 END) as backoff_6h,
    COUNT(CASE WHEN consecutive_zero_count >= 11 THEN 1 END) as backoff_24h
  FROM sensor_locations;
"
```

**Check data freshness:**
```bash
npx wrangler d1 execute theride-db --remote --command "
  SELECT
    COUNT(DISTINCT segment_id) as sensors_with_2026_data
  FROM sensor_hourly_data
  WHERE hour_timestamp >= '2026-01-01';
"
```
