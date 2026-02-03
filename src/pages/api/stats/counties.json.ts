import type { APIRoute } from 'astro';
import { getTopCountiesByBikes } from '@/utils/db';
import { CountiesQuerySchema, validateInput } from '@/schemas/api';
import { errorResponse, databaseUnavailableResponse } from '@/utils/errors';

/**
 * GET /api/stats/counties.json
 * Returns top counties by bike count with leaderboard data
 */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return databaseUnavailableResponse();
    }

    const db = locals.runtime.env.DB as D1Database;

    // Validate query parameters
    const validation = validateInput(CountiesQuerySchema, {
      limit: url.searchParams.get('limit'),
    });

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: validation.error,
          details: validation.details,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { limit } = validation.data;
    const counties = await getTopCountiesByBikes(db, limit);

    if (!counties || counties.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No county statistics available',
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
        data: counties,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minutes
        },
      }
    );
  } catch (error) {
    return errorResponse(error, 'Failed to retrieve county statistics');
  }
};
