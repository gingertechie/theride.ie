# Scripts

Utility scripts for maintaining The Ride database and infrastructure.

## Backfill Sensor Data

The backfill script allows you to fetch and import historical hourly sensor data from the Telraam API into the production D1 database.

### Prerequisites

- TELRAAM_API_KEY environment variable must be set
- You can get this from the project secrets or Cloudflare dashboard

### Usage

```bash
# Backfill all sensors for a specific date
npm run backfill -- 2025-11-30

# Backfill a specific sensor for a date
npm run backfill -- 2025-11-30 9000005607

# Show help
npm run backfill -- --help
```

### How it works

1. **Date Parsing**: Takes a date in YYYY-MM-DD format
2. **Sensor Selection**: If no segment ID is provided, fetches all sensors from the database
3. **API Fetch**: Calls Telraam API to get hourly data for the full 24-hour period
4. **Database Insert**: Inserts data into production D1 database using batch operations
5. **Conflict Resolution**: Uses UPSERT to handle duplicates (updates existing records)

### Examples

**Backfill missing data for November 30, 2025:**
```bash
TELRAAM_API_KEY=your_key npm run backfill -- 2025-11-30
```

**Backfill specific County Meath sensors:**
```bash
TELRAAM_API_KEY=your_key npm run backfill -- 2025-11-30 9000005607
TELRAAM_API_KEY=your_key npm run backfill -- 2025-11-30 9000006633
TELRAAM_API_KEY=your_key npm run backfill -- 2025-11-30 9000007344
```

**Backfill multiple days (using a loop):**
```bash
for date in 2025-11-28 2025-11-29 2025-11-30; do
  TELRAAM_API_KEY=your_key npm run backfill -- $date
done
```

### Output

The script provides detailed progress output:
- ✅ Success indicators for completed operations
- ⚠️ Warnings for sensors with no data
- ❌ Errors for failed operations
- 📊 Summary statistics at the end

### Notes

- The script writes directly to the **production database**
- Uses batch inserts (50 records at a time) to respect Cloudflare limits
- Automatically handles duplicate data with UPSERT
- Continues processing even if individual sensors fail
- Fetches data for the full 24-hour period (00:00:00 - 23:59:59 UTC)
