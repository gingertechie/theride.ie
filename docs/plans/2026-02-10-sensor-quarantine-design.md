# Sensor Quarantine System Design

**Date:** 2026-02-10
**Status:** Approved
**Context:** Some Telraam sensors report anomalous data (pedestrian zones miscounting pedestrians as bikes, malfunctioning car detection). Need a way to exclude suspect data from aggregates while keeping it visible for review.

## Requirements

- **Visibility:** Quarantined sensors visible on site with warning indicator, excluded from aggregate statistics
- **Flag Type:** Simple boolean flag (is_quarantined)
- **Storage:** Column in sensor_locations table
- **Management:** Manual SQL updates via wrangler CLI
- **Scope:** Retroactive - quarantining affects all historical data queries immediately

## Design Decisions

### 1. Database Schema Changes

Add a single boolean column to the existing `sensor_locations` table.

**Migration:** `db/migrations/XXXX_add_sensor_quarantine.sql`

```sql
-- Add quarantine flag to sensor_locations
ALTER TABLE sensor_locations
ADD COLUMN is_quarantined INTEGER DEFAULT 0 NOT NULL;

-- Add index for quarantine filtering (optional but recommended)
CREATE INDEX idx_sensor_quarantined
ON sensor_locations(is_quarantined);

-- Immediately quarantine known problematic sensors
UPDATE sensor_locations
SET is_quarantined = 1
WHERE segment_id IN (9000009365, 9000001485);
```

**Deployment:**
```bash
# Local testing
npx wrangler d1 execute theride-db --local --file=./db/migrations/XXXX_add_sensor_quarantine.sql

# Production deployment
npx wrangler d1 execute theride-db --remote --file=./db/migrations/XXXX_add_sensor_quarantine.sql
```

### 2. Query Modifications

**Core principle:** Add `WHERE is_quarantined = 0` to every query that calculates aggregates.

**National statistics** (`/api/stats/national.json.ts`):
```sql
-- Before
SELECT SUM(bike) as total_bikes, SUM(car) as total_cars, COUNT(*) as sensor_count
FROM sensor_hourly_data;

-- After
SELECT SUM(bike) as total_bikes, SUM(car) as total_cars, COUNT(DISTINCT shd.segment_id) as sensor_count
FROM sensor_hourly_data shd
INNER JOIN sensor_locations sl ON shd.segment_id = sl.segment_id
WHERE sl.is_quarantined = 0;
```

**County statistics** (`/api/stats/county/[county].json.ts`):
```sql
-- Add to WHERE clause
WHERE sl.county = ? AND sl.is_quarantined = 0
```

**County leaderboard** (`/api/stats/counties.json.ts`):
```sql
-- Before
SELECT county, SUM(bike) as total_bikes
FROM sensor_locations
GROUP BY county;

-- After
SELECT county, SUM(bike) as total_bikes
FROM sensor_locations
WHERE is_quarantined = 0
GROUP BY county;
```

**Sensor listings** (county pages):
```sql
-- When showing individual sensors, still show quarantined ones but mark them
SELECT segment_id, bike, car, is_quarantined
FROM sensor_locations
WHERE county = ?
-- No filter here - we want to show them with flags
```

**Strategy:** Aggregates exclude quarantined sensors, but individual sensor listings include them (so warnings can be displayed).

### 3. API Endpoint Changes

**National stats endpoint** (`/api/stats/national.json.ts`):
```typescript
// Response structure (no changes needed - just excludes quarantined data)
{
  "total_bikes": 150234,        // Excludes quarantined sensors
  "total_cars": 450123,          // Excludes quarantined sensors
  "active_sensors": 45,          // Count excludes quarantined
  "last_updated": "2026-02-10T02:00:00Z"
}
```

**County stats endpoint** (`/api/stats/county/[county].json.ts`):
```typescript
// Add is_quarantined field to sensor objects
{
  "county": "Dublin",
  "total_bikes": 45123,          // Excludes quarantined
  "total_cars": 123456,          // Excludes quarantined
  "sensors": [
    {
      "segment_id": 9000009365,
      "bike": 1809.6,
      "car": 42.3,
      "is_quarantined": true,    // ← Add this field
      "latitude": 53.123,
      "longitude": -6.456
    },
    {
      "segment_id": 9000001234,
      "bike": 450.2,
      "car": 1200.5,
      "is_quarantined": false,   // ← Add this field
      "latitude": 53.234,
      "longitude": -6.567
    }
  ]
}
```

**Counties leaderboard** (`/api/stats/counties.json.ts`):
```typescript
// No changes - already excludes quarantined via WHERE clause
{
  "counties": [
    {"county": "Dublin", "total_bikes": 45123},
    {"county": "Cork", "total_bikes": 23456}
  ]
}
```

### 4. Frontend Display

**County page sensor listing** (`/src/pages/county/[slug].astro`):

```astro
{sensors.map(sensor => (
  <div class="sensor-card">
    <div class="sensor-header">
      <h3>
        <a href={`https://telraam.net/en/location/${sensor.segment_id}`}>
          Sensor {sensor.segment_id}
        </a>
        {sensor.is_quarantined && (
          <span class="quarantine-badge">
            ⚠️ Data under review
          </span>
        )}
      </h3>
    </div>
    <div class="sensor-stats">
      <span>🚴 {sensor.bike} bikes</span>
      <span>🚗 {sensor.car} cars</span>
    </div>
  </div>
))}
```

**CSS styling** (add to `src/styles/global.css`):

```css
.quarantine-badge {
  display: inline-block;
  margin-left: 0.75rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  background: rgba(204, 255, 0, 0.1); /* Neon yellow with transparency */
  border: 1px solid var(--neon-yellow);
  color: var(--neon-yellow);
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sensor-card:has(.quarantine-badge) {
  opacity: 0.7; /* Dim quarantined sensors slightly */
}
```

### 5. Quarantine Management

**Quarantine a sensor:**
```bash
npx wrangler d1 execute theride-db --remote --command \
  "UPDATE sensor_locations SET is_quarantined = 1 WHERE segment_id = 9000009365;"
```

**Un-quarantine a sensor:**
```bash
npx wrangler d1 execute theride-db --remote --command \
  "UPDATE sensor_locations SET is_quarantined = 0 WHERE segment_id = 9000003521;"
```

**Quarantine multiple sensors:**
```bash
npx wrangler d1 execute theride-db --remote --command \
  "UPDATE sensor_locations SET is_quarantined = 1
   WHERE segment_id IN (9000009365, 9000001485, 9000006640);"
```

**List all quarantined sensors:**
```bash
npx wrangler d1 execute theride-db --remote --command \
  "SELECT segment_id, county, bike, car,
   ROUND((bike * 100.0 / NULLIF(car, 0)), 2) as bike_car_ratio_pct
   FROM sensor_locations
   WHERE is_quarantined = 1
   ORDER BY bike_car_ratio_pct DESC;"
```

**Find candidates for quarantine (outlier detection query):**
```sql
SELECT
    segment_id,
    COUNT(*) as hours_recorded,
    ROUND(SUM(bike), 1) as total_bikes,
    ROUND(SUM(car), 1) as total_cars,
    ROUND(AVG(bike), 2) as avg_bikes_per_hour,
    ROUND(AVG(car), 2) as avg_cars_per_hour,
    ROUND((SUM(bike) * 100.0 / NULLIF(SUM(car), 0)), 2) as bike_to_car_ratio_pct,
    MIN(hour_timestamp) as earliest_hour,
    MAX(hour_timestamp) as latest_hour
FROM sensor_hourly_data
WHERE hour_timestamp >= datetime('now', '-7 days')
GROUP BY segment_id
HAVING SUM(car) > 10
ORDER BY bike_to_car_ratio_pct DESC
LIMIT 50;
```

## Implementation Checklist

- [ ] Create and run database migration
- [ ] Update national stats API query
- [ ] Update county stats API query
- [ ] Update counties leaderboard API query
- [ ] Add `is_quarantined` field to API responses
- [ ] Add quarantine badge to county page frontend
- [ ] Add quarantine CSS styles
- [ ] Test with quarantined sensors
- [ ] Quarantine known problematic sensors (9000009365, 9000001485)

## Known Problematic Sensors

Based on initial outlier analysis (2026-02-10):

- **9000009365** - Pedestrianised area (Stephen's Green?) - 4,282% bike/car ratio
- **9000001485** - Pedestrianised area - 444% bike/car ratio (41k bikes, likely pedestrians)
- **9000006640** - Under investigation - 442% bike/car ratio

## Future Enhancements (Not in Scope)

- Quarantine categories/reasons (pedestrian_zone, malfunction, etc.)
- Audit trail (who quarantined, when, why)
- Automated outlier detection
- Admin UI for quarantine management
- Notification system for new outliers

## Trade-offs

**Chosen approach (simple flag):**
- ✅ Easy to implement
- ✅ No JOINs needed for most queries
- ✅ Clear mental model
- ❌ No historical context (why quarantined, by whom)
- ❌ Manual management only

**Alternative (separate table):**
- ✅ Better audit trail
- ✅ Can add metadata (reason, date, user)
- ❌ Requires JOINs on every query
- ❌ More complex to implement
- ❌ Overkill for current needs (YAGNI)
