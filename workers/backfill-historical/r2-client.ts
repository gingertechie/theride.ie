/**
 * R2 storage client for writing historical sensor data
 */

import { TelraamHourlyReport } from '../shared/telraam-schema';

export class R2StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'R2StorageError';
  }
}

/**
 * Generate R2 object key from parameters
 * Format: {sensor_id}/{start_date}-{end_date}.json
 * Example: "9000001435/20250101-20250131.json"
 */
export function generateR2Key(
  sensorId: string,
  startDate: string, // YYYYMMDD
  endDate: string    // YYYYMMDD
): string {
  return `${sensorId}/${startDate}-${endDate}.json`;
}

/**
 * Write hourly report data to R2 bucket
 * Overwrites if file already exists
 */
export async function writeToR2(
  bucket: R2Bucket,
  sensorId: string,
  startDate: string, // YYYYMMDD
  endDate: string,   // YYYYMMDD
  data: TelraamHourlyReport[]
): Promise<void> {

  const key = generateR2Key(sensorId, startDate, endDate);

  try {
    // Convert data to JSON string
    const jsonContent = JSON.stringify(data, null, 2);

    // Write to R2
    await bucket.put(key, jsonContent, {
      httpMetadata: {
        contentType: 'application/json',
      },
    });

  } catch (error) {
    throw new R2StorageError(
      `Failed to write to R2: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
