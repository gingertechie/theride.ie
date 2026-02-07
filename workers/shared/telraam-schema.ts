/**
 * Zod schemas for validating Telraam API responses
 * Prevents malformed data from corrupting the database
 */

import { z } from 'zod';

/**
 * Schema for a single hourly report from Telraam API
 */
export const TelraamHourlyReportSchema = z.object({
  date: z.string().min(1), // "2025-11-30" or ISO timestamp
  hour: z.number().int().min(0).max(23).optional(), // 0-23 (optional if date includes time)
  uptime: z.number().min(0).max(1), // 0-1
  heavy: z.number().min(0),
  car: z.number().min(0),
  bike: z.number().min(0),
  pedestrian: z.number().min(0),
  v85: z.number().optional(), // Speed metric, may be missing
});

/**
 * Schema for Telraam traffic API response
 */
export const TelraamTrafficResponseSchema = z.object({
  report: z.array(TelraamHourlyReportSchema),
});

/**
 * Type exports for TypeScript usage
 */
export type TelraamHourlyReport = z.infer<typeof TelraamHourlyReportSchema>;
export type TelraamTrafficResponse = z.infer<typeof TelraamTrafficResponseSchema>;
