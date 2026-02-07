import type { APIRoute } from 'astro';
import { getCountyWeeklyStats } from '@/utils/db';

/**
 * GET /api/stats/weekly/county/[county].json
 * Returns 52 weeks of county-specific bike trip totals for trend chart
 */
export const GET: APIRoute = async ({ locals, params }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'D1 database binding not available',
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
    const { county } = params;

    if (!county) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'County parameter is required',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const weeklyStats = await getCountyWeeklyStats(db, county, 52);

    if (!weeklyStats || weeklyStats.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No weekly statistics available for county: ${county}`,
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
          'Cache-Control': 'public, max-age=3600, s-maxage=3600', // 1 hour
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
