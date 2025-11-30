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
  report: TelraamReport[];
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('Starting scheduled sensor data update...');

    try {
      // Fetch data from Telraam API
      // Geographic center of Ireland: 53.4129°N, 8.2439°W
      // Radius: 300km to cover all of Ireland
      const response = await fetch('https://telraam-api.net/v1/reports/traffic_snapshot_live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': env.TELRAAM_API_KEY,
        },
        body: JSON.stringify({
          time: 'live',
          contents: 'minimal',
          area: '-8.2439,53.4129,300', // longitude, latitude, radius in km
        }),
      });

      if (!response.ok) {
        throw new Error(`Telraam API error: ${response.status} ${response.statusText}`);
      }

      const data: TelraamApiResponse = await response.json();
      console.log(`Received ${data.report?.length || 0} sensor reports from Telraam API`);

      if (!data.report || data.report.length === 0) {
        console.log('No sensor data received from API');
        return;
      }

      // Process each sensor report
      let updatedCount = 0;
      let skippedCount = 0;

      for (const report of data.report) {
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
