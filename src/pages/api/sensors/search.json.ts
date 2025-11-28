import type { APIRoute } from 'astro';
import { getSensorsInBounds, getSensorsByPeriod, getSensorsByDate } from '@/utils/db';

/**
 * POST /api/sensors/search.json
 * Search sensors by various criteria
 *
 * Body params:
 * - bounds: { minLat, maxLat, minLon, maxLon } - Geographic bounding box
 * - period: 'hourly' | 'daily' | 'monthly' - Aggregation period
 * - date: 'YYYY-MM-DD' - Specific date
 */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    const db = locals.runtime.env.DB as D1Database;
    const params = await request.json();

    // Search by geographic bounds
    if (params.bounds) {
      const { minLat, maxLat, minLon, maxLon } = params.bounds;

      if (
        typeof minLat !== 'number' ||
        typeof maxLat !== 'number' ||
        typeof minLon !== 'number' ||
        typeof maxLon !== 'number'
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid bounds parameters',
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }

      const sensors = await getSensorsInBounds(db, minLat, maxLat, minLon, maxLon);

      return new Response(
        JSON.stringify({
          success: true,
          data: sensors,
          count: sensors.length,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Search by period
    if (params.period) {
      if (!['hourly', 'daily', 'monthly'].includes(params.period)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid period. Must be: hourly, daily, or monthly',
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }

      const sensors = await getSensorsByPeriod(db, params.period);

      return new Response(
        JSON.stringify({
          success: true,
          data: sensors,
          count: sensors.length,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Search by date
    if (params.date) {
      const sensors = await getSensorsByDate(db, params.date);

      return new Response(
        JSON.stringify({
          success: true,
          data: sensors,
          count: sensors.length,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'No search criteria provided. Use bounds, period, or date.',
      }),
      {
        status: 400,
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
