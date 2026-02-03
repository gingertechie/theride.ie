import type { APIRoute } from 'astro';
import { getNationalStats } from '@/utils/db';
import { errorResponse, databaseUnavailableResponse } from '@/utils/errors';

/**
 * GET /api/stats/national.json
 * Returns national cycling statistics aggregated from all sensors
 */
export const GET: APIRoute = async ({ locals }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return databaseUnavailableResponse();
    }

    const db = locals.runtime.env.DB as D1Database;
    const stats = await getNationalStats(db);

    if (!stats) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No statistics available',
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
    return errorResponse(error, 'Failed to retrieve national statistics');
  }
};
