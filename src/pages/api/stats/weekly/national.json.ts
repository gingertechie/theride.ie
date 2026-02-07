import type { APIRoute } from 'astro';
import { getNationalWeeklyStats } from '@/utils/db';
import { errorResponse, databaseUnavailableResponse } from '@/utils/errors';

/**
 * GET /api/stats/weekly/national.json
 * Returns 52 weeks of national bike trip totals for trend chart
 */
export const GET: APIRoute = async ({ locals }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return databaseUnavailableResponse();
    }

    const db = locals.runtime.env.DB as D1Database;
    const weeklyStats = await getNationalWeeklyStats(db, 52);

    if (!weeklyStats || weeklyStats.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No weekly statistics available',
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
        data: weeklyStats,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600', // 1 hour (updates weekly)
        },
      }
    );
  } catch (error) {
    return errorResponse(error, 'Failed to retrieve weekly statistics');
  }
};
