import type { APIRoute } from 'astro';
import { getYesterdayDateRange } from '@/utils/db';

/**
 * GET /api/stats/busiest-hour.json
 * Returns yesterday's busiest hour (hour with most bike counts) across all sensors
 */

interface BusiestHourResult {
  hour: number;
  total_bikes: number;
}

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'D1 database binding not available. Make sure you are running with wrangler dev or have set up local bindings.',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const db = locals.runtime.env.DB as D1Database;
    const yesterday = getYesterdayDateRange();

    // Query to find the hour with the most bikes
    // Note: Using SUBSTR to extract hour from "YYYY-MM-DD HH:MM:SS" format
    // Position 12-13 contains the hour (0-indexed position 11, length 2)
    const result = await db
      .prepare(`
        SELECT
          CAST(SUBSTR(hour_timestamp, 12, 2) AS INTEGER) AS hour,
          SUM(bike) AS total_bikes
        FROM sensor_hourly_data
        WHERE hour_timestamp >= ?
          AND hour_timestamp < ?
        GROUP BY SUBSTR(hour_timestamp, 12, 2)
        ORDER BY total_bikes DESC
        LIMIT 1
      `)
      .bind(yesterday.start, yesterday.end)
      .first<BusiestHourResult>();

    if (!result || result.total_bikes === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No data available for yesterday',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Create timestamp for the busiest hour
    const yesterdayDate = yesterday.start.split(' ')[0]; // Get YYYY-MM-DD part
    const hourPadded = String(result.hour).padStart(2, '0');
    const timestamp = `${yesterdayDate}T${hourPadded}:00:00Z`;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          hour: result.hour,
          count: Math.round(result.total_bikes),
          timestamp,
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
