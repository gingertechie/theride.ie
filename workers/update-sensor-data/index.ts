/**
 * Scheduled Worker: Update Sensor Data
 * Runs nightly at 11:59 PM to fetch latest traffic data from Telraam API
 * and update the D1 database with current bike counts and traffic metrics
 */

interface Env {
  DB: D1Database;
  TELRAAM_API_KEY: string;
}

interface TelraamReport {
  segment_id: number;
  last_data_package: string;
  uptime: number;
  heavy: number;
  car: number;
  bike: number;
  pedestrian: number;
  night?: number;
  v85: number;
  date?: string;
  timezone?: string;
}

interface TelraamApiResponse {
  features: Array<{
    properties: TelraamReport;
  }>;
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('Starting scheduled sensor data update...');

    try {
      // Fetch data from Telraam API - returns all live traffic snapshots
      const response = await fetch('https://telraam-api.net/v1/reports/traffic_snapshot_live', {
        headers: {
          'X-Api-Key': env.TELRAAM_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Telraam API error: ${response.status} ${response.statusText}`);
      }

      const data: TelraamApiResponse = await response.json();
      console.log(`Received ${data.features?.length || 0} sensor reports from Telraam API`);

      if (!data.features || data.features.length === 0) {
        console.log('No sensor data received from API');
        return;
      }

      // Process each sensor report
      let updatedCount = 0;
      let skippedCount = 0;

      for (const feature of data.features) {
        const report = feature.properties;
        try {
          // Check if this segment exists in our database
          const existingSegment = await env.DB
            .prepare('SELECT segment_id FROM sensor_locations WHERE segment_id = ?')
            .bind(report.segment_id)
            .first();

          if (!existingSegment) {
            skippedCount++;
            continue;
          }

          // Update the sensor data
          await env.DB
            .prepare(`
              UPDATE sensor_locations
              SET
                bike = ?,
                heavy = ?,
                car = ?,
                uptime = ?,
                last_data_package = ?,
                v85 = ?,
                pedestrian = ?,
                night = ?,
                updated_at = datetime('now')
              WHERE segment_id = ?
            `)
            .bind(
              report.bike,
              report.heavy,
              report.car,
              report.uptime,
              report.last_data_package,
              report.v85,
              report.pedestrian,
              report.night ?? null,
              report.segment_id
            )
            .run();

          updatedCount++;
        } catch (error) {
          console.error(`Error updating segment ${report.segment_id}:`, error);
        }
      }

      console.log(`Update complete: ${updatedCount} sensors updated, ${skippedCount} sensors skipped (not in database)`);
    } catch (error) {
      console.error('Error in scheduled worker:', error);
      throw error; // Re-throw to mark the scheduled run as failed
    }
  },
};
