# HTTP-Callable Backfill Worker - Deployment Guide

## Overview

This worker provides an HTTP GET endpoint that fetches historical Telraam sensor data and stores raw JSON in R2. It's designed to be called by orchestration scripts for flexible, on-demand data backfilling.

## Endpoint

```
GET /backfill?sensor_id={id}&start_date={YYYYMMDD}&end_date={YYYYMMDD}
Header: X-Backfill-Secret: {your-secret-token}
```

**Example:**
```bash
curl -H "X-Backfill-Secret: your-secret-token" \
  "https://backfill-historical.your-worker.workers.dev/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250131"
```

**Authentication:** All requests require the `X-Backfill-Secret` header with a valid secret token.

## Query Parameters

- **sensor_id** (required) - Telraam segment ID (e.g., `9000001435`)
- **start_date** (required) - Start date in YYYYMMDD format (e.g., `20250101`)
- **end_date** (required) - End date in YYYYMMDD format (e.g., `20250131`)

**Date Range:** Inclusive - fetches from 00:00:00 on start_date to 23:59:59 on end_date

## HTTP Status Codes

### Success (2xx)
- **200 OK** - Data fetched and stored successfully

### Client Errors (4xx)
- **400 Bad Request** - Invalid parameters (missing, wrong format, invalid dates)
- **401 Unauthorized** - Missing or invalid X-Backfill-Secret header
- **404 Not Found** - No data available from Telraam API for this sensor/range
- **405 Method Not Allowed** - Used non-GET method

### Server Errors (5xx)
- **429 Too Many Requests** - Telraam API rate limit (retry with backoff)
- **500 Internal Server Error** - Worker bug or unexpected exception
- **502 Bad Gateway** - Telraam API returned invalid response
- **503 Service Unavailable** - Telraam API down
- **540 R2 Storage Failure** - R2 write failed (custom code)

## Configuration

### Environment Variables

Set in Cloudflare Dashboard (Workers & Pages > backfill-historical > Settings > Environment Variables):

- **TELRAAM_API_KEY** (required) - Your Telraam API key
- **BACKFILL_SECRET** (required) - Secret token for authenticating requests (generate a strong random string)

### R2 Bucket

Uses existing `theride-historical` R2 bucket. Files are stored as:
```
{sensor_id}/{start_date}-{end_date}.json
```

Example: `9000001435/20250101-20250131.json`

## Deployment

From the worker directory:

```bash
cd workers/backfill-historical
npm run deploy
```

**Important:** The `-c wrangler.toml` flag is included in npm scripts to avoid deploying the main site by mistake.

## Testing

### Local Development

```bash
cd workers/backfill-historical
npm run dev

# Set your secret token (use any string for local testing)
SECRET="test-secret-123"

# Test authentication (should fail with 401)
curl "http://localhost:8787/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250107"

# Test successful fetch with auth header (adjust dates for recent data)
curl -H "X-Backfill-Secret: $SECRET" \
  "http://localhost:8787/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250107"

# Test validation errors
curl -H "X-Backfill-Secret: $SECRET" \
  "http://localhost:8787/backfill?sensor_id=9000001435&start_date=invalid&end_date=20250131"

# Test missing parameters
curl -H "X-Backfill-Secret: $SECRET" \
  "http://localhost:8787/backfill?sensor_id=9000001435"
```

### Production Monitoring

View live logs:
```bash
npm run tail
```

## Orchestration Example

```bash
#!/bin/bash
# orchestrate-backfill.sh - Example orchestration script

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
    echo "❌ R2 storage failure - check logs"
  else
    echo "❌ Failed with status $status_code"
  fi

  sleep 5  # Polite delay between requests
done
```

### Status Code Handling in Scripts

- **200** - Continue to next request
- **400** - Log error, skip (bad parameters)
- **404** - Log warning, continue (no data for this range)
- **429** - Exponential backoff (60s, 120s, 240s...)
- **500/502/503** - Log error, retry with backoff
- **540** - Log R2 error, retry with backoff

## Architecture Notes

- **Stateless** - No progress tracking, each request is independent
- **No Retries** - Single Telraam API attempt per request (orchestrator handles retries)
- **Streaming** - Progress logs stream in real-time during execution
- **Idempotent** - Safe to re-run same request (overwrites R2 file)
- **R2 Only** - No D1 database writes (pure raw data storage)

## Migration from Cron Worker

This worker replaces the previous cron-based backfill worker. Key changes:

**Removed:**
- Cron scheduling
- Batch processing logic
- D1 database writes
- Internal retry logic
- Progress tracking

**Added:**
- HTTP GET endpoint
- Query parameter validation
- Streaming responses
- Custom status codes for orchestration

**Unchanged:**
- Telraam API integration
- R2 bucket usage
- Shared utilities (date formatting, schemas)
