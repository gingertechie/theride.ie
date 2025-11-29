import type { APIRoute } from 'astro';
import { getTopCountiesByBikes } from '@/utils/db';

/**
 * GET /api/stats/counties.json
 * Returns top counties by bike count with leaderboard data
 */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'D1 database binding not available. Make sure you are running with wrangler dev or have set up local bindings.',
          debug: {
            hasRuntime: !!locals.runtime,
            hasEnv: !!locals.runtime?.env,
            available: Object.keys(locals.runtime?.env || {}),
          }
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

    // Get limit from query params, default to 3
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 3;

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
