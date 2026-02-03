import type { APIRoute } from 'astro';
import { getSensorById, getSensorStats, upsertSensor, deleteSensor } from '@/utils/db';
import { verifyAdminAuth, unauthorizedResponse } from '@/utils/auth';

/**
 * GET /api/sensors/[id].json
 * Get a specific sensor by ID
 */
export const GET: APIRoute = async ({ locals, params }) => {
  try {
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
    const sensor = await getSensorById(db, segmentId);

    if (!sensor) {
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
        data: sensor,
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

/**
 * PUT /api/sensors/[id].json
 * Update or insert a sensor
 */
export const PUT: APIRoute = async ({ locals, params, request }) => {
  // Verify authentication
  if (!verifyAdminAuth(request, locals.runtime.env)) {
    return unauthorizedResponse();
  }

  try {
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
    const sensorData = await request.json();

    // Ensure segment_id matches the URL parameter
    sensorData.segment_id = segmentId;

    await upsertSensor(db, sensorData);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sensor updated successfully',
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

/**
 * DELETE /api/sensors/[id].json
 * Delete a sensor
 */
export const DELETE: APIRoute = async ({ locals, params, request }) => {
  // Verify authentication
  if (!verifyAdminAuth(request, locals.runtime.env)) {
    return unauthorizedResponse();
  }

  try {
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
    await deleteSensor(db, segmentId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sensor deleted successfully',
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
