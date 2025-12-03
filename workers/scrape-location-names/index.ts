/**
 * Scheduled Worker: Scrape Location Names
 * Runs weekly to fetch location names from Telraam pages
 * and populate the location_name column in the database
 */

interface Env {
  DB: D1Database;
}

interface SensorLocation {
  segment_id: number;
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('Starting location name scraper...');

    try {
      // Step 1: Get all sensors without location names
      const { results: sensors } = await env.DB
        .prepare('SELECT segment_id FROM sensor_locations WHERE location_name IS NULL')
        .all<SensorLocation>();

      if (!sensors || sensors.length === 0) {
        console.log('No sensors found without location names');
        return;
      }

      console.log(`Found ${sensors.length} sensors without location names`);

      // Step 2: Process each sensor
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const sensor of sensors) {
        try {
          // Rate limiting: Sleep 3 seconds before each request
          await sleep(3000);

          console.log(`Processing sensor ${sensor.segment_id}...`);

          // Scrape location name from Telraam page
          const locationName = await scrapeLocationName(sensor.segment_id);

          if (locationName === null) {
            console.log(`Sensor ${sensor.segment_id}: No location name found (404 or parse error)`);
            skippedCount++;
          } else {
            console.log(`Sensor ${sensor.segment_id}: Scraped location name "${locationName}"`);
            successCount++;
          }

          // Update database (store NULL if not found)
          await updateLocationName(env.DB, sensor.segment_id, locationName);

        } catch (error) {
          console.error(`Error processing sensor ${sensor.segment_id}:`, error);
          errorCount++;
          // Continue with next sensor
        }
      }

      console.log(`\nScraping complete!`);
      console.log(`Summary: ${successCount} successful, ${skippedCount} skipped (not found), ${errorCount} errors`);
      console.log(`Total processed: ${successCount + skippedCount + errorCount} of ${sensors.length}`);

    } catch (error) {
      console.error('Error in scheduled worker:', error);
      throw error;
    }
  },
};

/**
 * Scrape location name from Telraam page
 * Returns the location name or null if not found
 */
async function scrapeLocationName(segmentId: number): Promise<string | null> {
  const url = `https://telraam.net/en/location/${segmentId}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Sensor page doesn't exist
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Extract location name from <h1> tag
    // Pattern: <h1>Location Name</h1>
    const match = html.match(/<h1>(.*?)<\/h1>/);

    if (!match || !match[1]) {
      // No h1 tag found
      return null;
    }

    // Decode HTML entities and trim whitespace
    const locationName = decodeHtmlEntities(match[1].trim());

    return locationName || null;

  } catch (error) {
    // Re-throw error to be caught by caller
    throw error;
  }
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Update location name in database
 */
async function updateLocationName(
  db: D1Database,
  segmentId: number,
  locationName: string | null
): Promise<void> {
  await db
    .prepare("UPDATE sensor_locations SET location_name = ?, updated_at = datetime('now') WHERE segment_id = ?")
    .bind(locationName, segmentId)
    .run();
}

/**
 * Sleep for specified milliseconds to avoid rate limits
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
