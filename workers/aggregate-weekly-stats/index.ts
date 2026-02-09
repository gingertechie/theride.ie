/**
 * Weekly Stats Aggregation Worker
 *
 * Runs every Sunday at 3:00 AM UTC
 * Aggregates hourly data from the past week into sensor_weekly_stats table
 * Computes national and county-level weekly totals
 */

interface Env {
  DB: D1Database;
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const startTime = Date.now();
    const now = new Date();

    console.log(`[${now.toISOString()}] Starting weekly stats aggregation...`);

    try {
      // Calculate week boundaries (last complete week: Sunday-Saturday)
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);

      // Calculate days since last Sunday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const daysSinceSunday = today.getUTCDay();

      // Calculate the start of the previous complete week (Sunday)
      const lastSunday = new Date(today);
      if (daysSinceSunday === 0) {
        // Today is Sunday - the week that just ended was last Sunday to yesterday (Saturday)
        lastSunday.setUTCDate(today.getUTCDate() - 7);
      } else {
        // Not Sunday - go back to the most recent Sunday before this week
        lastSunday.setUTCDate(today.getUTCDate() - daysSinceSunday - 7);
      }

      // Week ends on Saturday (6 days after Sunday)
      const lastSaturday = new Date(lastSunday);
      lastSaturday.setUTCDate(lastSunday.getUTCDate() + 6);

      const weekEnding = lastSunday.toISOString().split('T')[0]; // YYYY-MM-DD format
      const weekStart = `${weekEnding} 00:00:00Z`;
      const weekEnd = `${lastSaturday.toISOString().split('T')[0]} 23:59:59Z`;

      console.log(`📊 Aggregating week ending ${weekEnding} (${weekStart} to ${weekEnd})`);

      // Step 1: Delete existing record for this week (in case of re-run)
      await env.DB.prepare(
        'DELETE FROM sensor_weekly_stats WHERE week_ending = ?'
      ).bind(weekEnding).run();

      // Step 2: Insert aggregated stats for all sensors this week
      await env.DB.prepare(`
        INSERT INTO sensor_weekly_stats (week_ending, segment_id, county, total_bikes, avg_daily, created_at, updated_at)
        SELECT
          ? as week_ending,
          h.segment_id,
          s.county,
          COALESCE(SUM(h.bike), 0) as total_bikes,
          COALESCE(ROUND(SUM(h.bike) * 1.0 / 7), 0) as avg_daily,
          datetime('now') as created_at,
          datetime('now') as updated_at
        FROM sensor_hourly_data h
        INNER JOIN sensor_locations s ON h.segment_id = s.segment_id
        WHERE h.hour_timestamp >= ?
          AND h.hour_timestamp <= ?
        GROUP BY h.segment_id, s.county
      `).bind(weekEnding, weekStart, weekEnd).run();

      const elapsedSeconds = (Date.now() - startTime) / 1000;
      console.log(`✅ Weekly aggregation complete (${elapsedSeconds.toFixed(2)}s)`);

    } catch (error) {
      console.error('❌ Error during weekly aggregation:', error);
      throw error;
    }
  },
};
