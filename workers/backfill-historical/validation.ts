/**
 * Query parameter validation for HTTP backfill endpoint
 */

export interface ValidatedParams {
  sensor_id: string;
  start_date: Date;
  end_date: Date;
  start_date_str: string; // Original YYYYMMDD format
  end_date_str: string;   // Original YYYYMMDD format
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Parse YYYYMMDD string to Date object at start of day (00:00:00 UTC)
 */
export function parseYYYYMMDD(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1; // JS months are 0-indexed
  const day = parseInt(dateStr.substring(6, 8));

  const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

  // Validate it's a real date
  if (isNaN(date.getTime())) {
    throw new ValidationError(`Invalid date: ${dateStr}`);
  }

  return date;
}

/**
 * Validate and parse query parameters from URL
 */
export function validateQueryParams(url: URL): ValidatedParams {
  // Extract parameters
  const sensor_id = url.searchParams.get('sensor_id');
  const start_date_str = url.searchParams.get('start_date');
  const end_date_str = url.searchParams.get('end_date');

  // Check all required parameters are present
  if (!sensor_id) {
    throw new ValidationError('Missing required parameter: sensor_id');
  }
  if (!start_date_str) {
    throw new ValidationError('Missing required parameter: start_date');
  }
  if (!end_date_str) {
    throw new ValidationError('Missing required parameter: end_date');
  }

  // Validate sensor_id is non-empty
  if (sensor_id.trim() === '') {
    throw new ValidationError('sensor_id cannot be empty');
  }

  // Validate date format (YYYYMMDD - exactly 8 digits)
  const datePattern = /^\d{8}$/;
  if (!datePattern.test(start_date_str)) {
    throw new ValidationError('Invalid date format for start_date (expected YYYYMMDD)');
  }
  if (!datePattern.test(end_date_str)) {
    throw new ValidationError('Invalid date format for end_date (expected YYYYMMDD)');
  }

  // Parse dates
  const start_date = parseYYYYMMDD(start_date_str);
  const end_date = parseYYYYMMDD(end_date_str);

  // Validate date logic (end must be >= start)
  if (end_date < start_date) {
    throw new ValidationError('end_date must be greater than or equal to start_date');
  }

  return {
    sensor_id: sensor_id.trim(),
    start_date,
    end_date,
    start_date_str,
    end_date_str,
  };
}
