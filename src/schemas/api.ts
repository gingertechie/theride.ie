import { z } from 'zod';

/**
 * Validation schemas for API inputs
 * Protects against invalid data, DoS attacks, and malformed requests
 */

/**
 * Counties endpoint query parameters
 * Enforces max limit to prevent DoS via unlimited result sets
 */
export const CountiesQuerySchema = z.object({
  limit: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '') {
        return 3;
      }
      const parsed = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(parsed as number) ? 3 : parsed;
    },
    z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100')
  ) as z.ZodType<number>,
});

/**
 * Search endpoint geographic bounds validation
 * Validates latitude/longitude ranges to prevent invalid queries
 */
export const SearchBoundsSchema = z.object({
  bounds: z.object({
    minLat: z.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
    maxLat: z.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
    minLon: z.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
    maxLon: z.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
  }).refine(
    (data) => data.minLat <= data.maxLat,
    { message: 'minLat must be less than or equal to maxLat' }
  ).refine(
    (data) => data.minLon <= data.maxLon,
    { message: 'minLon must be less than or equal to maxLon' }
  ),
});

/**
 * Sensor location data validation
 * Validates all sensor fields before database insertion
 */
export const SensorLocationSchema = z.object({
  segment_id: z.number().int().positive('Segment ID must be a positive integer'),
  last_data_package: z.string().min(1, 'last_data_package is required'),
  timezone: z.string().min(1),
  latitude: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  country: z.string().nullable(),
  county: z.string().nullable(),
  city_town: z.string().nullable(),
  locality: z.string().nullable(),
  eircode: z.string().nullable(),
}).transform((data) => ({
  ...data,
  // Ensure timezone has a default if empty string is provided
  timezone: data.timezone || 'Europe/Brussels',
}));

/**
 * Helper function to validate input and return formatted error response
 * @param schema Zod schema to validate against
 * @param data Data to validate
 * @returns Validation result with parsed data or error details
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; details: z.ZodIssue[] } {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: 'Validation failed',
      details: result.error.issues,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
