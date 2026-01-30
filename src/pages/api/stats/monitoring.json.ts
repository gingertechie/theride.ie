import type { APIRoute } from 'astro';
import { getMonitoringData } from '@/utils/db';

/**
 * GET /api/stats/monitoring.json
 * Returns health check data for external monitoring systems
 *
 * Compares today vs yesterday record counts to detect worker failures
 * Use this endpoint to trigger alerts if:
 * - is_healthy is false
 * - worker_likely_ran is false and data_freshness_hours > 24
 * - record_count is significantly lower than yesterday
 */
export const GET: APIRoute = async ({ locals }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'D1 database binding not available',
          debug: {
            hasRuntime: !!locals.runtime,
            hasEnv: !!locals.runtime?.env,
          },
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }
      );
    }

    const db = locals.runtime.env.DB as D1Database;
    const data = await getMonitoringData(db);

    if (!data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unable to fetch monitoring data',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
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
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
};
