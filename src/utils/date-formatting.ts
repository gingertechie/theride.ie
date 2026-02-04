/**
 * Shared date formatting utilities for The Ride project.
 * Provides consistent date/time formatting across the application.
 */

/**
 * Format a Date object to ISO 8601 format with UTC timezone.
 * Example: "2024-01-15 14:30:00Z"
 *
 * @param date - The date to format
 * @returns Formatted date string in "YYYY-MM-DD HH:MM:SSZ" format
 */
export function formatDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19) + 'Z';
}

/**
 * Format a Date object to ISO 8601 date format (date only, no time).
 * Example: "2024-01-15"
 *
 * @param date - The date to format
 * @returns Formatted date string in "YYYY-MM-DD" format
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format a Date object to ISO 8601 format at midnight UTC.
 * Useful for creating date range boundaries.
 * Example: "2024-01-15 00:00:00Z"
 *
 * @param date - The date to format
 * @returns Formatted date string in "YYYY-MM-DD 00:00:00Z" format
 */
export function formatMidnight(date: Date): string {
  return date.toISOString().split('T')[0] + ' 00:00:00Z';
}
