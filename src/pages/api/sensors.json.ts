import type { APIRoute } from 'astro';
import { getAllSensors } from '@/utils/db';

/**
 * GET /api/sensors.json
 * Returns all sensor locations
 */
export const GET: APIRoute = async ({ locals }) => {
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
    const sensors = await getAllSensors(db);

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
