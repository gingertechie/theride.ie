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
