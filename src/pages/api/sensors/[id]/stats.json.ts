import type { APIRoute } from 'astro';
import { getSensorStats } from '@/utils/db';

/**
 * GET /api/sensors/[id]/stats.json
 * Get traffic statistics for a specific sensor
 */
export const GET: APIRoute = async ({ locals, params }) => {
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

    const segmentId = parseInt(params.id || '');

    if (isNaN(segmentId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid segment ID',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const db = locals.runtime.env.DB as D1Database;
    const stats = await getSensorStats(db, segmentId);

    if (!stats) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Sensor not found',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: stats,
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
