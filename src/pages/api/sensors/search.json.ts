import type { APIRoute } from 'astro';
import { getSensorsInBounds } from '@/utils/db';
import { verifyAdminAuth, unauthorizedResponse } from '@/utils/auth';
import { SearchBoundsSchema, validateInput } from '@/schemas/api';

/**
 * POST /api/sensors/search.json
 * Search sensors by geographic criteria
 *
 * Body params:
 * - bounds: { minLat, maxLat, minLon, maxLon } - Geographic bounding box
 *
 * Note: period and date search removed as sensor_locations no longer stores traffic data
 */
export const POST: APIRoute = async ({ locals, request }) => {
  // Verify authentication
  if (!verifyAdminAuth(request, locals.runtime.env)) {
    return unauthorizedResponse();
  }

  try {
    const db = locals.runtime.env.DB as D1Database;
    const params = await request.json();

    // Validate search parameters
    const validation = validateInput(SearchBoundsSchema, params);

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

    const { bounds } = validation.data;
    const sensors = await getSensorsInBounds(
      db,
      bounds.minLat,
      bounds.maxLat,
      bounds.minLon,
      bounds.maxLon
    );

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
