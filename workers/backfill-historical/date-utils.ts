/**
 * Date conversion utilities for creating inclusive date ranges
 */

import { formatDateTime } from '../shared/date-formatting';

/**
 * Convert start date (YYYYMMDD) to ISO 8601 at 00:00:00Z
 * Example: 20250101 -> "2025-01-01 00:00:00Z"
 */
export function convertStartDate(date: Date): string {
  // Already set to 00:00:00Z from parseYYYYMMDD
  return formatDateTime(date);
}

/**
 * Convert end date (YYYYMMDD) to ISO 8601 at 23:59:59Z (inclusive)
 * Example: 20250131 -> "2025-01-31 23:59:59Z"
 */
export function convertEndDate(date: Date): string {
  // Set to end of day (23:59:59)
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  return formatDateTime(endOfDay);
}
