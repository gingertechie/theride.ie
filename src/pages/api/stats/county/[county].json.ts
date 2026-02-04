import type { APIRoute } from 'astro';
import { getCountyDetails } from '@/utils/db';

/**
 * GET /api/stats/county/[county].json
 * Returns detailed statistics and sensors for a specific county
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

    const countyData = await getCountyDetails(db, county);

    if (!countyData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No data found for county: ${county}`,
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
        data: countyData,
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
