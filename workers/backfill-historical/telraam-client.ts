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
