# HTTP-Callable Backfill Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace cron-based backfill worker with HTTP GET endpoint that fetches Telraam data and stores raw JSON in R2

**Architecture:** Single HTTP handler with streaming response, no retries, validation via query params, stores to R2 only (no D1)

**Tech Stack:** Cloudflare Workers, TypeScript, R2 bucket, Telraam API, Zod validation

---

## Task 1: Update wrangler.toml Configuration

**Files:**
- Modify: `workers/backfill-historical/wrangler.toml`

**Step 1: Remove cron configuration and update compatibility date**

Remove the `[triggers]` section entirely and update compatibility date to match design spec:

```toml
name = "backfill-historical"
type = "service"
main = "index.ts"
compatibility_date = "2025-02-10"

[[d1_databases]]
binding = "DB"
database_name = "theride-db"
database_id = "86c35cca-68fd-4d93-8d4a-c7a3ab463b10"

[[r2_buckets]]
binding = "HISTORICAL_BUCKET"
bucket_name = "theride-historical"

[observability]
[observability.logs]
enabled = false
invocation_logs = true
```

**Step 2: Commit configuration changes**

```bash
git add workers/backfill-historical/wrangler.toml
git commit -m "refactor: remove cron config, prepare for HTTP endpoint"
```

---

## Task 2: Create Query Parameter Validation Module

**Files:**
- Create: `workers/backfill-historical/validation.ts`

**Step 1: Create validation utilities**

Create the validation module with date parsing and parameter validation:

```typescript
/**
 * Query parameter validation for HTTP backfill endpoint
 */

export interface ValidatedParams {
  sensor_id: string;
  start_date: Date;
  end_date: Date;
  start_date_str: string; // Original YYYYMMDD format
  end_date_str: string;   // Original YYYYMMDD format
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Parse YYYYMMDD string to Date object at start of day (00:00:00 UTC)
 */
export function parseYYYYMMDD(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1; // JS months are 0-indexed
  const day = parseInt(dateStr.substring(6, 8));

  const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

  // Validate it's a real date
  if (isNaN(date.getTime())) {
    throw new ValidationError(`Invalid date: ${dateStr}`);
  }

  return date;
}

/**
 * Validate and parse query parameters from URL
 */
export function validateQueryParams(url: URL): ValidatedParams {
  // Extract parameters
  const sensor_id = url.searchParams.get('sensor_id');
  const start_date_str = url.searchParams.get('start_date');
  const end_date_str = url.searchParams.get('end_date');

  // Check all required parameters are present
  if (!sensor_id) {
    throw new ValidationError('Missing required parameter: sensor_id');
  }
  if (!start_date_str) {
    throw new ValidationError('Missing required parameter: start_date');
  }
  if (!end_date_str) {
    throw new ValidationError('Missing required parameter: end_date');
  }

  // Validate sensor_id is non-empty
  if (sensor_id.trim() === '') {
    throw new ValidationError('sensor_id cannot be empty');
  }

  // Validate date format (YYYYMMDD - exactly 8 digits)
  const datePattern = /^\d{8}$/;
  if (!datePattern.test(start_date_str)) {
    throw new ValidationError('Invalid date format for start_date (expected YYYYMMDD)');
  }
  if (!datePattern.test(end_date_str)) {
    throw new ValidationError('Invalid date format for end_date (expected YYYYMMDD)');
  }

  // Parse dates
  const start_date = parseYYYYMMDD(start_date_str);
  const end_date = parseYYYYMMDD(end_date_str);

  // Validate date logic (end must be >= start)
  if (end_date < start_date) {
    throw new ValidationError('end_date must be greater than or equal to start_date');
  }

  return {
    sensor_id: sensor_id.trim(),
    start_date,
    end_date,
    start_date_str,
    end_date_str,
  };
}
```

**Step 2: Commit validation module**

```bash
git add workers/backfill-historical/validation.ts
git commit -m "feat: add query parameter validation for HTTP endpoint"
```

---

## Task 3: Create Date Conversion Utilities

**Files:**
- Create: `workers/backfill-historical/date-utils.ts`

**Step 1: Create inclusive date range converter**

Create utilities to convert YYYYMMDD dates to inclusive ISO 8601 ranges:

```typescript
/**
 * Date conversion utilities for creating inclusive date ranges
 */

import { formatDateTime } from '../shared/date-formatting';

/**
 * Convert start date (YYYYMMDD) to ISO 8601 at 00:00:00Z
 * Example: 20250101 -> "2025-01-01 00:00:00Z"
 */
export function convertStartDate(date: Date): string {
  // Already set to 00:00:00Z from parseYYYYMMDD
  return formatDateTime(date);
}

/**
 * Convert end date (YYYYMMDD) to ISO 8601 at 23:59:59Z (inclusive)
 * Example: 20250131 -> "2025-01-31 23:59:59Z"
 */
export function convertEndDate(date: Date): string {
  // Set to end of day (23:59:59)
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  return formatDateTime(endOfDay);
}
```

**Step 2: Commit date utilities**

```bash
git add workers/backfill-historical/date-utils.ts
git commit -m "feat: add inclusive date range conversion utilities"
```

---

## Task 4: Create Telraam API Client

**Files:**
- Create: `workers/backfill-historical/telraam-client.ts`

**Step 1: Create API client (no retries)**

Create a simple API client that makes a single request to Telraam:

```typescript
/**
 * Telraam API client for fetching hourly traffic data
 * Single-request only (no retries) - orchestrator handles retries
 */

import { TelraamTrafficResponseSchema, TelraamHourlyReport } from '../shared/telraam-schema';

export class TelraamAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public isRateLimit: boolean = false
  ) {
    super(message);
    this.name = 'TelraamAPIError';
  }
}

/**
 * Fetch hourly traffic data from Telraam API for a specific segment and time range
 * Makes single request - no internal retries
 */
export async function fetchHourlyData(
  apiKey: string,
  segmentId: string,
  startTime: string, // ISO 8601: "2025-01-01 00:00:00Z"
  endTime: string     // ISO 8601: "2025-01-31 23:59:59Z"
): Promise<TelraamHourlyReport[]> {

  const body = {
    level: 'segments',
    format: 'per-hour',
    id: segmentId,
    time_start: startTime,
    time_end: endTime,
  };

  const response = await fetch('https://telraam-api.net/v1/reports/traffic', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // Handle rate limiting specifically
  if (response.status === 429) {
    throw new TelraamAPIError(
      'Rate limited by Telraam API',
      429,
      true
    );
  }

  // Handle other client errors
  if (response.status >= 400 && response.status < 500) {
    const errorText = await response.text();
    throw new TelraamAPIError(
      `Telraam API client error: ${response.status} ${errorText}`,
      response.status
    );
  }

  // Handle server errors
  if (response.status >= 500) {
    const errorText = await response.text();
    throw new TelraamAPIError(
      `Telraam API server error: ${response.status} ${errorText}`,
      response.status
    );
  }

  // Parse JSON response
  const data = await response.json();

  // Validate response structure using Zod schema
  const validation = TelraamTrafficResponseSchema.safeParse(data);
  if (!validation.success) {
    throw new TelraamAPIError(
      `Invalid API response structure: ${validation.error.message}`,
      502
    );
  }

  // Extract report array
  const report = validation.data.report || [];

  // Return empty array if no data (caller will handle as 404)
  return report;
}
```

**Step 2: Commit API client**

```bash
git add workers/backfill-historical/telraam-client.ts
git commit -m "feat: add Telraam API client with no retries"
```

---

## Task 5: Create R2 Storage Client

**Files:**
- Create: `workers/backfill-historical/r2-client.ts`

**Step 1: Create R2 storage utilities**

Create utilities to write raw JSON to R2:

```typescript
/**
 * R2 storage client for writing historical sensor data
 */

import { TelraamHourlyReport } from '../shared/telraam-schema';

export class R2StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'R2StorageError';
  }
}

/**
 * Generate R2 object key from parameters
 * Format: {sensor_id}/{start_date}-{end_date}.json
 * Example: "9000001435/20250101-20250131.json"
 */
export function generateR2Key(
  sensorId: string,
  startDate: string, // YYYYMMDD
  endDate: string    // YYYYMMDD
): string {
  return `${sensorId}/${startDate}-${endDate}.json`;
}

/**
 * Write hourly report data to R2 bucket
 * Overwrites if file already exists
 */
export async function writeToR2(
  bucket: R2Bucket,
  sensorId: string,
  startDate: string, // YYYYMMDD
  endDate: string,   // YYYYMMDD
  data: TelraamHourlyReport[]
): Promise<void> {

  const key = generateR2Key(sensorId, startDate, endDate);

  try {
    // Convert data to JSON string
    const jsonContent = JSON.stringify(data, null, 2);

    // Write to R2
    await bucket.put(key, jsonContent, {
      httpMetadata: {
        contentType: 'application/json',
      },
    });

  } catch (error) {
    throw new R2StorageError(
      `Failed to write to R2: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
```

**Step 2: Commit R2 client**

```bash
git add workers/backfill-historical/r2-client.ts
git commit -m "feat: add R2 storage client for raw JSON"
```

---

## Task 6: Create Streaming Response Handler

**Files:**
- Create: `workers/backfill-historical/streaming.ts`

**Step 1: Create streaming utilities**

Create utilities for streaming progress logs during execution:

```typescript
/**
 * Streaming response utilities for real-time progress logs
 */

/**
 * Helper to create a logging function that writes to a stream controller
 */
export function createLogger(controller: ReadableStreamDefaultController) {
  return (msg: string) => {
    controller.enqueue(new TextEncoder().encode(msg + '\n'));
  };
}

/**
 * Create streaming response with executor function
 * Handles errors and streams progress logs
 */
export function createStreamingResponse(
  statusCode: number,
  executor: (log: (msg: string) => void) => Promise<void>
): Response {

  const stream = new ReadableStream({
    async start(controller) {
      const log = createLogger(controller);

      try {
        await executor(log);
      } catch (error) {
        // Log error to stream
        log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

/**
 * Create error response with plain text message
 */
export function createErrorResponse(statusCode: number, message: string): Response {
  return new Response(`❌ Error: ${message}\n`, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
```

**Step 2: Commit streaming utilities**

```bash
git add workers/backfill-historical/streaming.ts
git commit -m "feat: add streaming response utilities"
```

---

## Task 7: Create Main HTTP Handler

**Files:**
- Modify: `workers/backfill-historical/index.ts`

**Step 1: Replace entire file with HTTP handler**

Replace the current cron-based worker with the HTTP endpoint:

```typescript
/**
 * HTTP-Callable Backfill Worker
 *
 * Fetches historical Telraam sensor data via HTTP GET endpoint and stores
 * raw JSON in R2 for later processing.
 *
 * Endpoint: GET /backfill?sensor_id={id}&start_date={YYYYMMDD}&end_date={YYYYMMDD}
 *
 * Features:
 * - Query parameter validation
 * - Inclusive date ranges (00:00:00 to 23:59:59)
 * - Single API attempt (no retries)
 * - Streaming progress logs
 * - Stores raw JSON to R2 (no D1 writes)
 * - Custom HTTP status codes for orchestration
 */

import { validateQueryParams, ValidationError } from './validation';
import { convertStartDate, convertEndDate } from './date-utils';
import { fetchHourlyData, TelraamAPIError } from './telraam-client';
import { writeToR2, R2StorageError, generateR2Key } from './r2-client';
import { createStreamingResponse, createErrorResponse } from './streaming';

interface Env {
  TELRAAM_API_KEY: string;
  HISTORICAL_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    // Only accept GET requests
    if (request.method !== 'GET') {
      return createErrorResponse(405, 'Method not allowed (use GET)');
    }

    // Parse URL
    const url = new URL(request.url);

    // Route: /backfill
    if (url.pathname !== '/backfill') {
      return createErrorResponse(404, 'Not found (use /backfill endpoint)');
    }

    // Validate query parameters
    let params;
    try {
      params = validateQueryParams(url);
    } catch (error) {
      if (error instanceof ValidationError) {
        return createErrorResponse(400, error.message);
      }
      return createErrorResponse(500, 'Internal validation error');
    }

    // Convert dates to inclusive ISO 8601 range
    const startTime = convertStartDate(params.start_date);
    const endTime = convertEndDate(params.end_date);

    // Execute backfill with streaming response
    return createStreamingResponse(200, async (log) => {

      log('Validating parameters...');
      log(`Fetching sensor ${params.sensor_id} from ${startTime} to ${endTime}...`);

      // Fetch data from Telraam API
      let hourlyData;
      try {
        hourlyData = await fetchHourlyData(
          env.TELRAAM_API_KEY,
          params.sensor_id,
          startTime,
          endTime
        );

        log(`Telraam API response: 200 OK`);

      } catch (error) {
        if (error instanceof TelraamAPIError) {
          log(`Telraam API response: ${error.statusCode}`);

          // Rethrow with appropriate status code
          if (error.isRateLimit) {
            throw new ResponseError(429, error.message);
          } else if (error.statusCode >= 500) {
            throw new ResponseError(503, error.message);
          } else if (error.statusCode === 502) {
            throw new ResponseError(502, error.message);
          } else {
            throw new ResponseError(400, error.message);
          }
        }
        throw error;
      }

      // Check if data is empty
      if (hourlyData.length === 0) {
        log('Telraam API returned no data for this sensor/range');
        throw new ResponseError(404, 'No data available from Telraam API');
      }

      log(`Received ${hourlyData.length} hourly records`);

      // Write to R2
      const r2Key = generateR2Key(params.sensor_id, params.start_date_str, params.end_date_str);
      log(`Writing to R2: ${r2Key}`);

      try {
        await writeToR2(
          env.HISTORICAL_BUCKET,
          params.sensor_id,
          params.start_date_str,
          params.end_date_str,
          hourlyData
        );

        log('R2 write: success');

      } catch (error) {
        if (error instanceof R2StorageError) {
          log(`R2 write: failed - ${error.message}`);
          throw new ResponseError(540, error.message);
        }
        throw error;
      }

      log(`✅ Complete - ${hourlyData.length} hours stored`);
    });
  },
};

/**
 * Custom error class for controlling HTTP response status codes
 */
class ResponseError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ResponseError';
  }
}
```

**Step 2: Fix streaming response to handle ResponseError**

Update the streaming utilities to handle custom status codes:

Modify `workers/backfill-historical/streaming.ts`:

```typescript
/**
 * Streaming response utilities for real-time progress logs
 */

/**
 * Helper to create a logging function that writes to a stream controller
 */
export function createLogger(controller: ReadableStreamDefaultController) {
  return (msg: string) => {
    controller.enqueue(new TextEncoder().encode(msg + '\n'));
  };
}

/**
 * Custom error class for controlling HTTP response status codes
 */
export class ResponseError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ResponseError';
  }
}

/**
 * Create streaming response with executor function
 * Handles errors and streams progress logs
 */
export function createStreamingResponse(
  executor: (log: (msg: string) => void) => Promise<void>
): Response {

  let statusCode = 200;

  const stream = new ReadableStream({
    async start(controller) {
      const log = createLogger(controller);

      try {
        await executor(log);
      } catch (error) {
        // Handle ResponseError for custom status codes
        if (error instanceof ResponseError) {
          statusCode = error.statusCode;
          log(`❌ Error: ${error.message}`);
        } else {
          // Unexpected error -> 500
          statusCode = 500;
          log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

/**
 * Create error response with plain text message
 */
export function createErrorResponse(statusCode: number, message: string): Response {
  return new Response(`❌ Error: ${message}\n`, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
```

**Step 3: Fix index.ts to use updated streaming API**

Update the fetch handler in `index.ts` to match the updated streaming signature and export ResponseError:

```typescript
/**
 * HTTP-Callable Backfill Worker
 *
 * Fetches historical Telraam sensor data via HTTP GET endpoint and stores
 * raw JSON in R2 for later processing.
 *
 * Endpoint: GET /backfill?sensor_id={id}&start_date={YYYYMMDD}&end_date={YYYYMMDD}
 *
 * Features:
 * - Query parameter validation
 * - Inclusive date ranges (00:00:00 to 23:59:59)
 * - Single API attempt (no retries)
 * - Streaming progress logs
 * - Stores raw JSON to R2 (no D1 writes)
 * - Custom HTTP status codes for orchestration
 */

import { validateQueryParams, ValidationError } from './validation';
import { convertStartDate, convertEndDate } from './date-utils';
import { fetchHourlyData, TelraamAPIError } from './telraam-client';
import { writeToR2, R2StorageError, generateR2Key } from './r2-client';
import { createStreamingResponse, createErrorResponse, ResponseError } from './streaming';

interface Env {
  TELRAAM_API_KEY: string;
  HISTORICAL_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    // Only accept GET requests
    if (request.method !== 'GET') {
      return createErrorResponse(405, 'Method not allowed (use GET)');
    }

    // Parse URL
    const url = new URL(request.url);

    // Route: /backfill
    if (url.pathname !== '/backfill') {
      return createErrorResponse(404, 'Not found (use /backfill endpoint)');
    }

    // Validate query parameters
    let params;
    try {
      params = validateQueryParams(url);
    } catch (error) {
      if (error instanceof ValidationError) {
        return createErrorResponse(400, error.message);
      }
      return createErrorResponse(500, 'Internal validation error');
    }

    // Convert dates to inclusive ISO 8601 range
    const startTime = convertStartDate(params.start_date);
    const endTime = convertEndDate(params.end_date);

    // Execute backfill with streaming response
    return createStreamingResponse(async (log) => {

      log('Validating parameters...');
      log(`Fetching sensor ${params.sensor_id} from ${startTime} to ${endTime}...`);

      // Fetch data from Telraam API
      let hourlyData;
      try {
        hourlyData = await fetchHourlyData(
          env.TELRAAM_API_KEY,
          params.sensor_id,
          startTime,
          endTime
        );

        log(`Telraam API response: 200 OK`);

      } catch (error) {
        if (error instanceof TelraamAPIError) {
          log(`Telraam API response: ${error.statusCode}`);

          // Rethrow with appropriate status code
          if (error.isRateLimit) {
            throw new ResponseError(429, error.message);
          } else if (error.statusCode >= 500) {
            throw new ResponseError(503, error.message);
          } else if (error.statusCode === 502) {
            throw new ResponseError(502, error.message);
          } else {
            throw new ResponseError(400, error.message);
          }
        }
        throw error;
      }

      // Check if data is empty
      if (hourlyData.length === 0) {
        log('Telraam API returned no data for this sensor/range');
        throw new ResponseError(404, 'No data available from Telraam API');
      }

      log(`Received ${hourlyData.length} hourly records`);

      // Write to R2
      const r2Key = generateR2Key(params.sensor_id, params.start_date_str, params.end_date_str);
      log(`Writing to R2: ${r2Key}`);

      try {
        await writeToR2(
          env.HISTORICAL_BUCKET,
          params.sensor_id,
          params.start_date_str,
          params.end_date_str,
          hourlyData
        );

        log('R2 write: success');

      } catch (error) {
        if (error instanceof R2StorageError) {
          log(`R2 write: failed - ${error.message}`);
          throw new ResponseError(540, error.message);
        }
        throw error;
      }

      log(`✅ Complete - ${hourlyData.length} hours stored`);
    });
  },
};
```

**Step 4: Commit HTTP handler**

```bash
git add workers/backfill-historical/index.ts workers/backfill-historical/streaming.ts
git commit -m "feat: replace cron worker with HTTP endpoint handler"
```

---

## Task 8: Test Locally

**Files:**
- None (testing only)

**Step 1: Start local development server**

```bash
cd workers/backfill-historical
npm run dev
```

Expected output: Server starts on `http://localhost:8787`

**Step 2: Test missing parameters**

```bash
curl "http://localhost:8787/backfill"
```

Expected: HTTP 400 with error message about missing sensor_id

**Step 3: Test invalid date format**

```bash
curl "http://localhost:8787/backfill?sensor_id=9000001435&start_date=invalid&end_date=20250131"
```

Expected: HTTP 400 with error about invalid date format

**Step 4: Test reversed dates**

```bash
curl "http://localhost:8787/backfill?sensor_id=9000001435&start_date=20250201&end_date=20250101"
```

Expected: HTTP 400 with error about end_date before start_date

**Step 5: Test successful request with real sensor**

```bash
curl "http://localhost:8787/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250107"
```

Expected: Streaming output showing:
- Validating parameters...
- Fetching sensor...
- Telraam API response: 200 OK
- Received N hourly records
- Writing to R2: 9000001435/20250101-20250107.json
- R2 write: success
- ✅ Complete

**Step 6: Stop dev server**

Press Ctrl+C to stop the server

---

## Task 9: Update Documentation

**Files:**
- Modify: `workers/backfill-historical/DEPLOYMENT.md`

**Step 1: Replace DEPLOYMENT.md with HTTP endpoint docs**

Replace the entire file with new documentation:

```markdown
# HTTP-Callable Backfill Worker - Deployment Guide

## Overview

This worker provides an HTTP GET endpoint that fetches historical Telraam sensor data and stores raw JSON in R2. It's designed to be called by orchestration scripts for flexible, on-demand data backfilling.

## Endpoint

```
GET /backfill?sensor_id={id}&start_date={YYYYMMDD}&end_date={YYYYMMDD}
```

**Example:**
```bash
curl "https://backfill-historical.your-worker.workers.dev/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250131"
```

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

# Test successful fetch (adjust dates for recent data)
curl "http://localhost:8787/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250107"

# Test validation errors
curl "http://localhost:8787/backfill?sensor_id=9000001435&start_date=invalid&end_date=20250131"

# Test missing parameters
curl "http://localhost:8787/backfill?sensor_id=9000001435"
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
```

**Step 2: Commit documentation**

```bash
git add workers/backfill-historical/DEPLOYMENT.md
git commit -m "docs: update deployment guide for HTTP endpoint"
```

---

## Task 10: Clean Up Obsolete Files

**Files:**
- Delete: `workers/backfill-historical/TEST.md`
- Delete: `workers/backfill-historical/test-local.sh`

**Step 1: Remove test files**

These files were specific to the cron-based worker and are no longer relevant:

```bash
git rm workers/backfill-historical/TEST.md
git rm workers/backfill-historical/test-local.sh
git commit -m "chore: remove obsolete cron worker test files"
```

---

## Task 11: Deploy to Production

**Files:**
- None (deployment only)

**Step 1: Deploy worker**

```bash
cd workers/backfill-historical
npm run deploy
```

Expected: Deployment succeeds, shows worker URL

**Step 2: Test production endpoint**

```bash
curl "https://backfill-historical.YOUR-SUBDOMAIN.workers.dev/backfill?sensor_id=9000001435&start_date=20250101&end_date=20250107"
```

Expected: Streaming output with successful backfill

**Step 3: Verify R2 storage**

Check that the file was created in R2:

```bash
npx wrangler r2 object get theride-historical/9000001435/20250101-20250107.json --file test-output.json
cat test-output.json | head -20
```

Expected: JSON file contains Telraam hourly report array

**Step 4: Clean up test file**

```bash
rm test-output.json
```

---

## Task 12: Create Orchestration Script Template

**Files:**
- Create: `workers/backfill-historical/orchestrate-example.sh`

**Step 1: Create example orchestration script**

Provide a template script for users to customize:

```bash
#!/bin/bash
# orchestrate-example.sh - Example orchestration script for backfilling historical data
#
# Usage: ./orchestrate-example.sh
#
# This script demonstrates how to call the HTTP backfill worker for multiple sensors
# with proper error handling and rate limit management.

set -euo pipefail

# Configuration
WORKER_URL="https://backfill-historical.YOUR-SUBDOMAIN.workers.dev/backfill"
START_DATE="20240101"  # Adjust to your desired start date
END_DATE="20240131"    # Adjust to your desired end date

# List of sensor IDs to backfill (replace with your sensors)
SENSORS=(
  "9000001435"
  "9000001437"
  "9000007890"
)

# Statistics
TOTAL_SENSORS=${#SENSORS[@]}
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

echo "=================================================="
echo "Backfill Orchestration"
echo "=================================================="
echo "Worker URL: $WORKER_URL"
echo "Date Range: $START_DATE to $END_DATE"
echo "Total Sensors: $TOTAL_SENSORS"
echo "=================================================="
echo ""

for i in "${!SENSORS[@]}"; do
  sensor_id="${SENSORS[$i]}"
  sensor_num=$((i + 1))

  echo "[$sensor_num/$TOTAL_SENSORS] Processing sensor $sensor_id..."

  # Make request and capture both body and status code
  response=$(curl -s -w "\n%{http_code}" \
    "$WORKER_URL?sensor_id=$sensor_id&start_date=$START_DATE&end_date=$END_DATE")

  # Extract status code (last line)
  status_code=$(echo "$response" | tail -n1)

  # Extract body (all except last line)
  body=$(echo "$response" | head -n-1)

  # Handle different status codes
  case $status_code in
    200)
      echo "  ✅ Success"
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      ;;
    404)
      echo "  ⚠️  No data available (skipped)"
      SKIP_COUNT=$((SKIP_COUNT + 1))
      ;;
    429)
      echo "  ⏳ Rate limited - sleeping 60 seconds..."
      sleep 60
      echo "  🔄 Retrying sensor $sensor_id..."
      # Retry once after rate limit
      response=$(curl -s -w "\n%{http_code}" \
        "$WORKER_URL?sensor_id=$sensor_id&start_date=$START_DATE&end_date=$END_DATE")
      status_code=$(echo "$response" | tail -n1)
      if [ "$status_code" = "200" ]; then
        echo "  ✅ Success on retry"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      else
        echo "  ❌ Failed on retry (status: $status_code)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
      fi
      ;;
    540)
      echo "  ❌ R2 storage failure"
      echo "  Error details:"
      echo "$body" | grep "Error:" || true
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
    *)
      echo "  ❌ Failed with status $status_code"
      echo "  Error details:"
      echo "$body" | grep "Error:" || true
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
  esac

  # Polite delay between requests (except on last sensor)
  if [ $sensor_num -lt $TOTAL_SENSORS ]; then
    sleep 5
  fi

  echo ""
done

# Summary
echo "=================================================="
echo "Backfill Complete"
echo "=================================================="
echo "Total: $TOTAL_SENSORS"
echo "Success: $SUCCESS_COUNT"
echo "Skipped: $SKIP_COUNT"
echo "Failed: $FAIL_COUNT"
echo "=================================================="

# Exit with error if any failures
if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
```

**Step 2: Make script executable**

```bash
chmod +x workers/backfill-historical/orchestrate-example.sh
```

**Step 3: Commit orchestration script**

```bash
git add workers/backfill-historical/orchestrate-example.sh
git commit -m "docs: add example orchestration script"
```

---

## Task 13: Final Commit and Summary

**Files:**
- None (git operations only)

**Step 1: Review all changes**

```bash
git log --oneline -15
```

Expected: List of commits from this implementation

**Step 2: Create summary commit message**

Create a final empty commit with full summary:

```bash
git commit --allow-empty -m "feat: complete HTTP-callable backfill worker

Replaces cron-based backfill worker with HTTP GET endpoint.

Changes:
- HTTP GET endpoint at /backfill with query params
- Query parameter validation (sensor_id, start_date, end_date)
- Inclusive date range conversion (YYYYMMDD to ISO 8601)
- Single Telraam API request (no retries)
- Streaming progress logs during execution
- Raw JSON storage to R2 (no D1 writes)
- Custom HTTP status codes (including 540 for R2 failures)
- Example orchestration script

Architecture:
- Modular design (validation, API client, R2 client, streaming)
- Error handling with specific status codes
- Idempotent (safe to re-run)
- Stateless (no progress tracking)

See docs/plans/2026-02-10-http-backfill-worker-design.md for full design.
"
```

---

## Completion Checklist

Before considering this implementation complete, verify:

- [ ] All 13 tasks completed successfully
- [ ] Worker deploys without errors
- [ ] Local testing passes for all scenarios
- [ ] Production endpoint responds correctly
- [ ] R2 files are created with correct structure
- [ ] Documentation is updated and accurate
- [ ] Orchestration script template is provided
- [ ] All commits have clear messages
- [ ] No obsolete files remain

## Next Steps (Not in This Plan)

After this implementation is complete:

1. Create actual orchestration script for your specific sensors
2. Identify missing date ranges in your data
3. Run orchestration script to backfill gaps
4. Monitor R2 bucket size and costs
5. Consider adding batch endpoint for multiple sensors
6. Consider adding authentication/rate limiting
