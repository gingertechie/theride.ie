# HTTP-Callable Backfill Worker Design

**Date:** 2026-02-10
**Status:** Approved
**Replaces:** Cron-based `workers/backfill-historical`

## Overview

Replace the cron-based backfill worker with an HTTP-callable endpoint that fetches historical Telraam sensor data and stores raw JSON in R2. This enables orchestration scripts to selectively backfill missing data without monolithic batch processing.

## Problem Statement

Current backfill worker issues:
1. Hard to debug as a cron job (runs on schedule, can't trigger on-demand)
2. Monolithic batch processing fails differently each run
3. D1 database (500MB limit) cannot hold all historical data
4. No flexibility to backfill specific sensor/date ranges

## Solution

HTTP GET endpoint that:
- Accepts sensor ID and date range as query parameters
- Fetches raw JSON from Telraam API
- Stores in R2 (no D1 writes)
- Streams progress logs during execution
- Returns appropriate HTTP status codes for orchestration

## Architecture

### Endpoint Design

**URL Pattern:**
```
GET /backfill?sensor_id={id}&start_date={YYYYMMDD}&end_date={YYYYMMDD}
```

**Example:**
```bash
curl "https://backfill-historical.worker.workers.dev/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250131"
```

**Why GET instead of POST:**
- Maximum simplicity for curl calls
- Easy to test in browser
- Orchestration scripts are trivial
- Side effects acceptable for internal tools

### Request Flow

1. Parse and validate query parameters
2. Convert YYYYMMDD dates to ISO 8601 format (inclusive range)
3. Call Telraam API once (no retries)
4. Validate response schema (allowing nulls)
5. Write raw report array to R2
6. Stream progress logs throughout
7. Return HTTP status code

### R2 Storage Structure

**Path Pattern:**
```
{sensor_id}/{start_date}-{end_date}.json
```

**Examples:**
```
9000001435/20250101-20250131.json
9000001435/20250201-20250228.json
9000007890/20241201-20241231.json
```

**File Content:**
Raw Telraam API `report` array (not full response):
```json
[
  {"date": "2025-01-01", "hour": 0, "bike": 5, "car": 12, "v85": null, ...},
  {"date": "2025-01-01", "hour": 1, "bike": null, "car": 8, ...},
  ...
]
```

**R2 Bucket:**
Use existing `theride-historical` bucket

**Overwrite Behavior:**
Silently overwrite existing files (allows re-fetching if needed)

## Request Handling

### Query Parameters

**Required:**
- `sensor_id` - Telraam segment ID (string, typically 10 digits)
- `start_date` - Start date in YYYYMMDD format
- `end_date` - End date in YYYYMMDD format

**Validation Rules:**
1. All three parameters must be present (400 if missing)
2. Dates must match `/^\d{8}$/` pattern (400 if invalid)
3. Dates must parse to valid Date objects (400 if invalid)
4. `end_date >= start_date` (400 if reversed)
5. Sensor ID must be non-empty string

### Date Range Conversion

**User Input (Inclusive):**
- `start_date="20250101"` → `2025-01-01 00:00:00Z`
- `end_date="20250131"` → `2025-01-31 23:59:59Z`

**Critical:**
Verify `formatDateTime()` utility produces exact format Telraam API expects (this has caused issues before).

## Telraam API Interaction

### API Call

```http
POST https://telraam-api.net/v1/reports/traffic
X-Api-Key: {TELRAAM_API_KEY}
Content-Type: application/json

{
  "level": "segments",
  "format": "per-hour",
  "id": "9000001435",
  "time_start": "2025-01-01 00:00:00Z",
  "time_end": "2025-01-31 23:59:59Z"
}
```

### Response Validation

**Use:** Existing `TelraamTrafficResponseSchema` from `shared/telraam-schema.ts`

**Important:** Schema must allow null values for:
- `v85` (85th percentile speed)
- `bike`, `car`, `heavy`, `pedestrian` (counts)
- `uptime`

Relax schema if needed - Telraam API returns nulls frequently.

### Error Handling

**No Internal Retries:**
- Single API attempt only
- Orchestrator handles retry logic

**Error Mapping:**
- `200 OK` → Extract report array, proceed to R2 write
- `429 Too Many Requests` → Return 429 to caller
- `4xx Client Error` → Return 400 Bad Request
- `5xx Server Error` → Return 503 Service Unavailable
- Invalid response structure → Return 502 Bad Gateway
- Empty report array → Return 404 Not Found

## Streaming Response

### Implementation

Use `ReadableStream` with chunked transfer encoding to stream progress logs:

```typescript
const stream = new ReadableStream({
  async start(controller) {
    const log = (msg: string) => {
      controller.enqueue(new TextEncoder().encode(msg + '\n'));
    };

    log('Validating parameters...');
    log('Fetching sensor 9000001435 from 2025-01-01 to 2025-01-31...');
    log('Telraam API response: 200 OK');
    log('Received 744 hourly records');
    log('Writing to R2: 9000001435/20250101-20250131.json');
    log('R2 write: success');
    log('✅ Complete - 744 hours stored');

    controller.close();
  }
});

return new Response(stream, {
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  status: 200
});
```

### Log Minimization

**Cloudflare Free Tier Limits:**
- 256KB log size limit per request
- 50 subrequests per request

**Strategy:**
- Essential logs only (~10 lines per request)
- No verbose data dumps (no full API responses)
- Include response codes for debugging
- Estimated output: ~1KB per request (well under limit)

**Example Output:**
```
Validating parameters...
Fetching sensor 9000001435 from 2025-01-01 00:00:00Z to 2025-01-31 23:59:59Z...
Telraam API response: 200 OK
Received 744 hourly records
Writing to R2: 9000001435/20250101-20250131.json
R2 write: success
✅ Complete - 744 hours stored
```

### R2 Status Logging

R2's `put()` method doesn't return HTTP status codes:
- Success: `R2 write: success`
- Failure: `R2 write: failed - {error message}`

## HTTP Status Codes

### Success (2xx)

- **200 OK** - Data fetched and stored successfully

### Client Errors (4xx)

- **400 Bad Request** - Invalid parameters (missing, wrong format, invalid dates, end before start)
- **404 Not Found** - Telraam API returned empty report array (no data for this sensor/range)

### Server Errors (5xx)

- **429 Too Many Requests** - Telraam API rate limit (orchestrator should back off)
- **500 Internal Server Error** - Worker bug or unexpected exception
- **502 Bad Gateway** - Telraam API returned invalid response structure
- **503 Service Unavailable** - Telraam API down (5xx from upstream)
- **540 R2 Storage Failure** - R2 write failed (custom code for clear orchestration signaling)

**Note:** 540 is a non-standard custom code chosen to avoid conflicts with Cloudflare or standard HTTP codes.

### Error Response Format

All errors return plain text (matching streaming format):
```
❌ Error: Invalid date format for start_date (expected YYYYMMDD)
```

## Configuration

### wrangler.toml

```toml
name = "backfill-historical"
main = "index.ts"
compatibility_date = "2025-02-10"

[[r2_buckets]]
binding = "HISTORICAL_BUCKET"
bucket_name = "theride-historical"
```

### Environment Variables

Set in Cloudflare Dashboard (Workers & Pages > Settings > Environment Variables):

- **TELRAAM_API_KEY** (required) - Your Telraam API key

### Deployment

```bash
cd workers/backfill-historical
npm run deploy
```

**Important:** Use `-c wrangler.toml` flag (included in npm scripts) to avoid deploying main site.

## Testing

### Local Development

```bash
cd workers/backfill-historical
npm run dev

# Test successful fetch
curl "http://localhost:8787/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250131"

# Test validation errors
curl "http://localhost:8787/backfill?sensor_id=9000001435&start_date=invalid&end_date=20250131"

# Test missing parameters
curl "http://localhost:8787/backfill?sensor_id=9000001435"
```

### Production Monitoring

```bash
npm run tail  # View live worker logs
```

## Orchestration

### Example Script

```bash
#!/bin/bash
WORKER_URL="https://backfill-historical.your-worker.workers.dev/backfill"

for sensor_id in 9000001435 9000001437 9000007890; do
  echo "Fetching $sensor_id..."

  response=$(curl -s -w "\n%{http_code}" "$WORKER_URL?sensor_id=$sensor_id&start_date=20240101&end_date=20240131")
  status_code=$(echo "$response" | tail -n1)

  if [ "$status_code" = "200" ]; then
    echo "✅ Success"
  elif [ "$status_code" = "429" ]; then
    echo "⏳ Rate limited - sleeping 60s"
    sleep 60
  elif [ "$status_code" = "540" ]; then
    echo "❌ R2 storage failure"
  else
    echo "❌ Failed with status $status_code"
  fi

  sleep 5  # Polite delay between requests
done
```

### Status Code Handling

- **200**: Continue to next sensor
- **400**: Log error, skip this request (bad parameters)
- **404**: Log warning, continue (no data available)
- **429**: Exponential backoff (wait 60s, 120s, 240s...)
- **500/502/503**: Log error, retry with backoff
- **540**: Log R2 error, retry with backoff

## Migration from Current Worker

### What Changes

- **Remove:** Cron schedule, batch processing logic, D1 writes
- **Remove:** `getSensorsWithOldestData()`, `insertHourlyData()` functions
- **Remove:** `fetchWithRetry` (no internal retries)
- **Keep:** `TelraamTrafficResponseSchema`, `formatDateTime()` utility
- **Add:** HTTP request handling, query param validation, streaming response

### What Stays

- Same Telraam API endpoint and request structure
- Same R2 bucket (`theride-historical`)
- Same `TELRAAM_API_KEY` environment variable
- Same shared utilities (`shared/telraam-schema.ts`, `shared/date-formatting.ts`)

## Trade-offs

### Advantages

✅ Debuggable (call on-demand, see immediate feedback)
✅ Flexible (fetch any sensor/range via orchestration)
✅ Scalable storage (R2 has no 500MB limit like D1)
✅ Simple error handling (HTTP status codes)
✅ Stateless (no progress tracking needed)
✅ Idempotent (safe to re-run same request)

### Disadvantages

❌ Requires orchestration script (not automatic like cron)
❌ No built-in retry logic (orchestrator must handle)
❌ Manual triggering (no scheduled backfill)

## Future Considerations

### Phase 2 (Not in Initial Implementation)

- Add authentication (API key or Cloudflare Access)
- Add rate limiting (prevent abuse)
- Add batch endpoint (fetch multiple sensors in one call)
- Add async mode (return job ID, poll for status)
- Add data validation endpoint (check what's in R2)

### Data Processing (Separate Workers)

This worker only stores raw JSON. Future workers can:
- Process R2 JSON files into aggregated stats
- Generate weekly/monthly summaries
- Export to D1 for live site queries
- Clean up old/duplicate files
