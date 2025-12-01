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

      // Fetch all our segment IDs in one query to avoid per-sensor lookups
      const { results: ourSegments } = await env.DB
        .prepare('SELECT segment_id FROM sensor_locations')
        .all<{ segment_id: number }>();

      const ourSegmentIds = new Set(ourSegments.map(s => s.segment_id));
      console.log(`Database has ${ourSegmentIds.size} registered sensors`);

      // Filter Telraam data to only sensors we track
      const relevantReports = data.features
        .map(f => f.properties)
        .filter(report => ourSegmentIds.has(report.segment_id));

      console.log(`Found ${relevantReports.length} matching sensors to update`);

      if (relevantReports.length === 0) {
        console.log('No matching sensors to update');
        return;
      }

      // Batch update queries to avoid hitting subrequest limits
      // Cloudflare allows up to 50 statements per batch
      const BATCH_SIZE = 50;
      let updatedCount = 0;

      for (let i = 0; i < relevantReports.length; i += BATCH_SIZE) {
        const batch = relevantReports.slice(i, i + BATCH_SIZE);

        // Create batch of update statements
        const statements = batch.map(report =>
          env.DB.prepare(`
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
          `).bind(
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
        );

        try {
          // Execute batch
          await env.DB.batch(statements);
          updatedCount += batch.length;
          console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: Updated ${batch.length} sensors`);
        } catch (error) {
          console.error(`Error updating batch starting at index ${i}:`, error);
          // Continue with next batch even if one fails
        }
      }

      const skippedCount = data.features.length - relevantReports.length;
      console.log(`Update complete: ${updatedCount} sensors updated, ${skippedCount} sensors skipped (not in database)`);
    } catch (error) {
      console.error('Error in scheduled worker:', error);
      throw error; // Re-throw to mark the scheduled run as failed
    }
  },
};
