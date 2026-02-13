# Sensor Quarantine Management

## Overview

The quarantine system allows flagging sensors with suspect data. Quarantined sensors:
- **Excluded** from all aggregate statistics (national totals, county leaderboards)
- **Visible** on county pages with warning badges
- **Reversible** - can be un-quarantined if proven legitimate

## Quarantine Commands

### Check Quarantined Sensors

```bash
npx wrangler d1 execute theride-db --remote --command \
  "SELECT segment_id, county, is_quarantined
   FROM sensor_locations
   WHERE is_quarantined = 1
   ORDER BY segment_id;"
```

### Quarantine a Sensor

```bash
npx wrangler d1 execute theride-db --remote --command \
  "UPDATE sensor_locations
   SET is_quarantined = 1
   WHERE segment_id = 9000009365;"
```

### Un-Quarantine a Sensor

```bash
npx wrangler d1 execute theride-db --remote --command \
  "UPDATE sensor_locations
   SET is_quarantined = 0
   WHERE segment_id = 9000003521;"
```

### Quarantine Multiple Sensors

```bash
npx wrangler d1 execute theride-db --remote --command \
  "UPDATE sensor_locations
   SET is_quarantined = 1
   WHERE segment_id IN (9000009365, 9000001485, 9000006640);"
```

## Finding Outliers

Run this query weekly to identify candidates for quarantine:

```sql
SELECT
    segment_id,
    COUNT(*) as hours_recorded,
    ROUND(SUM(bike), 1) as total_bikes,
    ROUND(SUM(car), 1) as total_cars,
    ROUND((SUM(bike) * 100.0 / NULLIF(SUM(car), 0)), 2) as bike_to_car_ratio_pct
FROM sensor_hourly_data
WHERE hour_timestamp >= datetime('now', '-7 days')
GROUP BY segment_id
HAVING SUM(car) > 10
ORDER BY bike_to_car_ratio_pct DESC
LIMIT 50;
```

**Interpretation:**
- **> 20%** - Very high bike usage or potential outlier
- **5-20%** - Healthy bike corridor
- **< 5%** - Typical car-dominated road

Investigate sensors with ratios > 100% for potential miscounting.

## Known Quarantined Sensors

| Sensor ID | Reason | Date Quarantined |
|-----------|--------|------------------|
| 9000009365 | Pedestrian zone - miscounting pedestrians as bikes (4,282% ratio) | 2026-02-10 |
| 9000001485 | Pedestrian zone - miscounting pedestrians as bikes (444% ratio) | 2026-02-10 |

## Testing Locally

```bash
# Quarantine a sensor locally
npx wrangler d1 execute theride-db --local --command \
  "UPDATE sensor_locations SET is_quarantined = 1 WHERE segment_id = 9000009365;"

# Check local quarantine status
npx wrangler d1 execute theride-db --local --command \
  "SELECT segment_id, is_quarantined FROM sensor_locations LIMIT 10;"
```
