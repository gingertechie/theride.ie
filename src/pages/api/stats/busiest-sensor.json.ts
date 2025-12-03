import type { APIRoute } from 'astro';
import { getBusiestSensor } from '@/utils/db';

/**
 * GET /api/stats/busiest-sensor.json
 * Returns yesterday's busiest sensor (sensor with most bike counts)
 */
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
    const result = await getBusiestSensor(db);

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

    // Format location name with fallback
    const locationName = result.location_name ?? `Sensor ${result.segment_id}`;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          segment_id: result.segment_id,
          location_name: locationName,
          county: result.county,
          bike_count: Math.round(result.total_bikes),
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
