# Weekly Trend Charts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 52-week trend charts showing bike trip totals to national dashboard and county pages, with 365-day data retention.

**Architecture:** Create a new `sensor_weekly_stats` table for pre-aggregated weekly totals. Weekly aggregation runs Sunday via Cloudflare Worker. New API endpoints serve weekly data quickly. Frontend components render static charts using Velvet & Neon design system.

**Tech Stack:** D1 database (SQLite), Cloudflare Workers, Astro, Recharts or custom SVG for charts, Tailwind CSS, Velvet & Neon design system.

---

## Phase 1: Database Schema & Migrations

### Task 1: Add Database Indexes for Performance

**Files:**
- Modify: `db/schema.sql`

**Step 1: Read the schema**

The schema is in `db/schema.sql`. We need to add indexes for the `sensor_hourly_data` table to handle 365 days of queries efficiently.

**Step 2: Add indexes to schema.sql**

Add these lines at the end of `db/schema.sql`:

```sql
-- Index for hourly data queries (segment_id, date for performance)
CREATE INDEX IF NOT EXISTS idx_sensor_hourly_segment_date ON sensor_hourly_data(segment_id, hour_timestamp);

-- Index for county aggregations
CREATE INDEX IF NOT EXISTS idx_sensor_hourly_county ON sensor_hourly_data(segment_id) WHERE (SELECT county FROM sensor_locations sl WHERE sl.segment_id = sensor_hourly_data.segment_id) IS NOT NULL;
```

**Step 3: Verify schema is valid**

Run: `head -50 db/schema.sql && tail -20 db/schema.sql`
Expected: Schema shows CREATE TABLE statements, ends with new indexes.

**Step 4: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add performance indexes for 365-day hourly data queries"
```

---

### Task 2: Create sensor_weekly_stats Table

**Files:**
- Create: `db/migrations/0002_create_weekly_stats_table.sql`

**Step 1: Create migration file**

Create `db/migrations/0002_create_weekly_stats_table.sql` with:

```sql
-- Weekly aggregated sensor statistics
-- Pre-computed aggregates for fast chart rendering
-- Updated weekly (Sunday) by aggregation worker

CREATE TABLE IF NOT EXISTS sensor_weekly_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_ending TEXT NOT NULL,  -- Date of Sunday (YYYY-MM-DD)
    segment_id INTEGER NOT NULL,
    county TEXT,                 -- Denormalized for fast county aggregations
    total_bikes INTEGER NOT NULL DEFAULT 0,
    avg_daily INTEGER,           -- Average bikes per day that week
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(week_ending, segment_id)
);

-- Index for fast lookups by county and week
CREATE INDEX IF NOT EXISTS idx_weekly_county_week ON sensor_weekly_stats(county, week_ending DESC);

-- Index for sensor-specific weekly trends
CREATE INDEX IF NOT EXISTS idx_weekly_segment ON sensor_weekly_stats(segment_id, week_ending DESC);

-- Index for cleanup (delete old weeks)
CREATE INDEX IF NOT EXISTS idx_weekly_date ON sensor_weekly_stats(week_ending);
```

**Step 2: Verify migration**

Run: `cat db/migrations/0002_create_weekly_stats_table.sql`
Expected: Shows CREATE TABLE and indexes for sensor_weekly_stats.

**Step 3: Run migration locally**

Run: `npx wrangler d1 execute theride-db --local --file=./db/migrations/0002_create_weekly_stats_table.sql`
Expected: Success message, no errors.

**Step 4: Commit**

```bash
git add db/migrations/0002_create_weekly_stats_table.sql
git commit -m "feat: create sensor_weekly_stats table for weekly aggregations"
```

---

### Task 3: Update schema.sql to include new table

**Files:**
- Modify: `db/schema.sql`

**Step 1: Append the new table to schema.sql**

Add the sensor_weekly_stats table definition to the end of `db/schema.sql` (after sensor_hourly_data indexes). This ensures fresh databases include the table.

**Step 2: Verify schema**

Run: `tail -30 db/schema.sql`
Expected: Shows new table definition and indexes.

**Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "chore: add sensor_weekly_stats to base schema"
```

---

### Task 4: Update cleanupOldData to preserve hourly data for 365 days

**Files:**
- Modify: `workers/update-sensor-data/index.ts` (around line 76-77)

**Step 1: Locate cleanupOldData function**

Search in the worker file for the `cleanupOldData` function. It currently deletes data after 7 days.

**Step 2: Update retention from 7 to 365 days**

Find the line that calculates the cutoff date. Change from 7 days to 365 days:

```typescript
// Before:
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

// After:
const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
```

And update the SQL DELETE statement to use the new 365-day cutoff.

**Step 3: Verify the change**

Run: `grep -A 5 "cleanupOldData" workers/update-sensor-data/index.ts`
Expected: Shows function using 365-day cutoff.

**Step 4: Commit**

```bash
git add workers/update-sensor-data/index.ts
git commit -m "feat: extend data retention from 7 days to 365 days"
```

---

## Phase 2: Weekly Aggregation Worker

### Task 5: Create weekly aggregation worker

**Files:**
- Create: `workers/aggregate-weekly-stats/index.ts`
- Create: `workers/aggregate-weekly-stats/wrangler.toml`
- Create: `workers/aggregate-weekly-stats/package.json`
- Create: `workers/aggregate-weekly-stats/tsconfig.json`

**Step 1: Create worker directory and files**

Copy from existing worker structure:

```bash
mkdir -p workers/aggregate-weekly-stats
cp workers/update-sensor-data/tsconfig.json workers/aggregate-weekly-stats/
```

**Step 2: Create package.json**

Create `workers/aggregate-weekly-stats/package.json`:

```json
{
  "name": "aggregate-weekly-stats",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev -c wrangler.toml",
    "deploy": "wrangler deploy -c wrangler.toml",
    "tail": "wrangler tail aggregate-weekly-stats"
  },
  "dependencies": {},
  "devDependencies": {
    "wrangler": "^3.0.0"
  }
}
```

**Step 3: Create wrangler.toml**

Create `workers/aggregate-weekly-stats/wrangler.toml`:

```toml
name = "aggregate-weekly-stats"
type = "service"
main = "index.ts"

[env.production]
routes = [
  { pattern = "example.com/aggregate-weekly-stats", zone_name = "example.com" }
]

[triggers]
crons = ["0 3 * * 0"] # Sunday 3:00 AM UTC
```

**Step 4: Create index.ts with worker logic**

Create `workers/aggregate-weekly-stats/index.ts`:

```typescript
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

interface WeeklyStat {
  week_ending: string;
  segment_id: number;
  county: string | null;
  total_bikes: number;
  avg_daily: number;
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const startTime = Date.now();
    const now = new Date();

    console.log(`[${now.toISOString()}] Starting weekly stats aggregation...`);

    try {
      // Calculate week boundaries (last complete week: Sunday-Saturday)
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);

      const daysFromSunday = today.getUTCDay(); // 0 = Sunday
      const lastSunday = new Date(today);
      lastSunday.setUTCDate(today.getUTCDate() - daysFromSunday - 1); // Previous Sunday

      const lastSaturday = new Date(lastSunday);
      lastSaturday.setUTCDate(lastSunday.getUTCDate() + 6); // Saturday (end of that week)

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
```

**Step 5: Verify files exist**

Run: `ls -la workers/aggregate-weekly-stats/`
Expected: Shows index.ts, wrangler.toml, package.json, tsconfig.json

**Step 6: Commit**

```bash
git add workers/aggregate-weekly-stats/
git commit -m "feat: create weekly stats aggregation worker"
```

---

### Task 6: Deploy weekly aggregation worker

**Files:**
- Already created in Task 5

**Step 1: Install dependencies**

Run: `cd workers/aggregate-weekly-stats && npm install`
Expected: node_modules created, no errors.

**Step 2: Deploy worker**

Run: `cd workers/aggregate-weekly-stats && npm run deploy`
Expected: Deployment successful message from Wrangler.

**Step 3: Verify deployment**

Run: `npx wrangler deployments list --name aggregate-weekly-stats`
Expected: Shows recent deployment.

**Step 4: Commit (for tracking)**

```bash
git add workers/aggregate-weekly-stats/package-lock.json
git commit -m "chore: deploy aggregate-weekly-stats worker"
```

---

## Phase 3: API Endpoints

### Task 7: Add weekly stats function to db.ts

**Files:**
- Modify: `src/utils/db.ts`

**Step 1: Read existing db.ts**

The file has utility functions for querying stats. We'll add functions for weekly data.

**Step 2: Add function to get national weekly stats**

Add at the end of `src/utils/db.ts`:

```typescript
/**
 * Get national weekly statistics for trend chart (last 52 weeks)
 */
export interface NationalWeeklyStats {
  week_ending: string;
  total_bikes: number;
}

export async function getNationalWeeklyStats(
  db: D1Database,
  weeks: number = 52
): Promise<NationalWeeklyStats[]> {
  const { results } = await db
    .prepare(`
      SELECT
        w.week_ending,
        COALESCE(SUM(w.total_bikes), 0) as total_bikes
      FROM sensor_weekly_stats w
      INNER JOIN sensor_locations s ON w.segment_id = s.segment_id
      WHERE s.county IS NOT NULL
      GROUP BY w.week_ending
      ORDER BY w.week_ending ASC
      LIMIT ?
    `)
    .bind(weeks)
    .all<NationalWeeklyStats>();

  return results || [];
}
```

**Step 3: Add function to get county weekly stats**

Add to `src/utils/db.ts`:

```typescript
/**
 * Get county-specific weekly statistics for trend chart (last 52 weeks)
 */
export interface CountyWeeklyStats {
  week_ending: string;
  total_bikes: number;
}

export async function getCountyWeeklyStats(
  db: D1Database,
  county: string,
  weeks: number = 52
): Promise<CountyWeeklyStats[]> {
  const { results } = await db
    .prepare(`
      SELECT
        week_ending,
        COALESCE(SUM(total_bikes), 0) as total_bikes
      FROM sensor_weekly_stats
      WHERE county = ?
      GROUP BY week_ending
      ORDER BY week_ending ASC
      LIMIT ?
    `)
    .bind(county, weeks)
    .all<CountyWeeklyStats>();

  return results || [];
}
```

**Step 4: Verify functions are added**

Run: `tail -50 src/utils/db.ts | grep -A 2 "getNationalWeeklyStats\|getCountyWeeklyStats"`
Expected: Shows both function signatures.

**Step 5: Commit**

```bash
git add src/utils/db.ts
git commit -m "feat: add weekly stats database functions"
```

---

### Task 8: Create national weekly stats API endpoint

**Files:**
- Create: `src/pages/api/stats/weekly/national.json.ts`

**Step 1: Create endpoint file**

Create `src/pages/api/stats/weekly/national.json.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getNationalWeeklyStats } from '@/utils/db';
import { errorResponse, databaseUnavailableResponse } from '@/utils/errors';

/**
 * GET /api/stats/weekly/national.json
 * Returns 52 weeks of national bike trip totals for trend chart
 */
export const GET: APIRoute = async ({ locals }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return databaseUnavailableResponse();
    }

    const db = locals.runtime.env.DB as D1Database;
    const weeklyStats = await getNationalWeeklyStats(db, 52);

    if (!weeklyStats || weeklyStats.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No weekly statistics available',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: weeklyStats,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600', // 1 hour (updates weekly)
        },
      }
    );
  } catch (error) {
    return errorResponse(error, 'Failed to retrieve weekly statistics');
  }
};
```

**Step 2: Verify endpoint**

Run: `cat src/pages/api/stats/weekly/national.json.ts | head -20`
Expected: Shows import statements and endpoint definition.

**Step 3: Test endpoint locally**

Run: `npm run dev:wrangler` (in separate terminal)
Then: `curl http://localhost:4321/api/stats/weekly/national.json`
Expected: JSON response with weekly data or empty array initially.

**Step 4: Commit**

```bash
git add src/pages/api/stats/weekly/national.json.ts
git commit -m "feat: add national weekly stats API endpoint"
```

---

### Task 9: Create county weekly stats API endpoint

**Files:**
- Create: `src/pages/api/stats/weekly/county/[county].json.ts`

**Step 1: Create county endpoint file**

Create `src/pages/api/stats/weekly/county/[county].json.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getCountyWeeklyStats } from '@/utils/db';

/**
 * GET /api/stats/weekly/county/[county].json
 * Returns 52 weeks of county-specific bike trip totals for trend chart
 */
export const GET: APIRoute = async ({ locals, params }) => {
  try {
    // Check if runtime is available
    if (!locals.runtime?.env?.DB) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'D1 database binding not available',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const db = locals.runtime.env.DB as D1Database;
    const { county } = params;

    if (!county) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'County parameter is required',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const weeklyStats = await getCountyWeeklyStats(db, county, 52);

    if (!weeklyStats || weeklyStats.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No weekly statistics available for county: ${county}`,
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: weeklyStats,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600', // 1 hour
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
```

**Step 2: Verify endpoint**

Run: `cat src/pages/api/stats/weekly/county/[county].json.ts | head -20`
Expected: Shows imports and endpoint.

**Step 3: Test endpoint locally**

With dev server running, test: `curl http://localhost:4321/api/stats/weekly/county/Dublin.json`
Expected: JSON response with weekly data.

**Step 4: Commit**

```bash
git add src/pages/api/stats/weekly/county/[county].json.ts
git commit -m "feat: add county weekly stats API endpoint"
```

---

## Phase 4: Frontend Components

### Task 10: Create WeeklyTrendChart component

**Files:**
- Create: `src/components/sections/WeeklyTrendChart.astro`

**Step 1: Create component file**

Create `src/components/sections/WeeklyTrendChart.astro`:

```astro
---
import type { NationalWeeklyStats } from '@/utils/db';

interface Props {
  data: Array<{ week_ending: string; total_bikes: number }>;
  title: string;
  accentColor: 'green' | 'pink';  // 'green' for national, 'pink' for county
  subtitle?: string;
}

const { data, title, accentColor, subtitle } = Astro.props;

// Prepare chart data
const chartData = data.map(d => ({
  week: new Date(d.week_ending).toLocaleDateString('en-IE', {
    month: 'short',
    day: 'numeric'
  }),
  bikes: d.total_bikes,
  fullDate: d.week_ending
}));

// Calculate max value for scaling
const maxValue = Math.max(...data.map(d => d.total_bikes), 1);

// CSS classes based on accent color
const accentClass = accentColor === 'pink' ? 'text-neon-pink' : 'text-neon-green';
const glowClass = accentColor === 'pink' ? 'text-glow-pink' : 'text-glow-green';
const borderClass = accentColor === 'pink' ? 'border-neon-pink' : 'border-neon-green';
---

<div class="weekly-trend-container">
  <div class="mb-8">
    <h3 class={`text-2xl font-bold text-white mb-2 ${glowClass}`}>
      {title}
    </h3>
    {subtitle && (
      <p class="text-text-secondary text-lg">{subtitle}</p>
    )}
  </div>

  <div class="bg-velvet-midnight rounded-2xl p-8 border-2" class:list={[borderClass]}>
    <!-- Simple bar chart: SVG-based static visualization -->
    <svg
      viewBox="0 0 1200 400"
      class="w-full h-auto"
      preserveAspectRatio="none"
      style={{ minHeight: '300px' }}
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          x1="60"
          y1={400 - ratio * 350 + 20}
          x2="1180"
          y2={400 - ratio * 350 + 20}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />
      ))}

      {/* Y-axis */}
      <line x1="50" y1="20" x2="50" y2="370" stroke="rgba(255, 255, 255, 0.3)" strokeWidth="2" />

      {/* X-axis */}
      <line x1="50" y1="370" x2="1180" y2="370" stroke="rgba(255, 255, 255, 0.3)" strokeWidth="2" />

      {/* Bars */}
      {chartData.map((d, i) => {
        const barWidth = (1130 / chartData.length) * 0.8;
        const barX = 60 + (i * 1130) / chartData.length + ((1130 / chartData.length) - barWidth) / 2;
        const barHeight = (d.bikes / maxValue) * 350;
        const barY = 370 - barHeight;
        const neonColor = accentColor === 'pink' ? '#FF10F0' : '#39FF14';

        return (
          <g key={`bar-${i}`}>
            <rect
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              fill={neonColor}
              opacity="0.8"
              style={{
                filter: accentColor === 'pink'
                  ? 'drop-shadow(0 0 8px #FF10F0)'
                  : 'drop-shadow(0 0 8px #39FF14)',
              }}
            />
          </g>
        );
      })}

      {/* Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const value = Math.round(maxValue * ratio);
        const y = 375 - ratio * 350;
        return (
          <text
            x="45"
            y={y + 5}
            textAnchor="end"
            fill="rgba(255, 255, 255, 0.5)"
            fontSize="12"
          >
            {value.toLocaleString()}
          </text>
        );
      })}
    </svg>

    <!-- Legend -->
    <div class="mt-6 text-center text-text-secondary text-sm">
      <p>Weekly bike trips • {chartData.length} weeks</p>
    </div>
  </div>
</div>

<style>
  .weekly-trend-container {
    margin: 2rem 0;
  }
</style>
```

**Step 2: Verify component**

Run: `head -50 src/components/sections/WeeklyTrendChart.astro`
Expected: Shows Astro component structure.

**Step 3: Commit**

```bash
git add src/components/sections/WeeklyTrendChart.astro
git commit -m "feat: create WeeklyTrendChart component for trend visualization"
```

---

### Task 11: Add WeeklyTrendChart to national dashboard

**Files:**
- Modify: `src/pages/index.astro`

**Step 1: Import component and fetch data**

Add import at the top with other imports:

```astro
import WeeklyTrendChart from "../components/sections/WeeklyTrendChart.astro";
```

Add data fetching after the existing county stats fetches:

```astro
// Fetch weekly trend data
const weeklyResponse = await fetch(`${Astro.url.origin}/api/stats/weekly/national.json`);
const weeklyResult = await weeklyResponse.json();
const weeklyData = weeklyResult.success ? weeklyResult.data : [];
```

**Step 2: Add component to template**

Insert after the county leaderboard section (after line 132 in current file), before the "All Counties Navigation Grid" comment:

```astro
<!-- Weekly Trend Section -->
{weeklyData && weeklyData.length > 0 && (
  <div class="mt-20">
    <div class="neon-divider mb-12"></div>
    <div class="max-w-3xl mx-auto mb-8">
      <p class="text-text-secondary text-lg text-center leading-relaxed">
        A year of pedal power: here's how the Irish are cycling, week by week.
      </p>
    </div>
    <WeeklyTrendChart
      data={weeklyData}
      title="National Weekly Trends"
      accentColor="green"
      subtitle="52 weeks of bike trips across Ireland"
    />
  </div>
)}
```

**Step 3: Verify changes**

Run: `grep -n "WeeklyTrendChart" src/pages/index.astro`
Expected: Shows import and component usage.

**Step 4: Test locally**

Run: `npm run dev:wrangler`
Visit: `http://localhost:4321`
Expected: Page loads with weekly trend section (initially empty if no data).

**Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add weekly trend chart to national dashboard"
```

---

### Task 12: Add WeeklyTrendChart to county pages

**Files:**
- Modify: `src/pages/county/[slug].astro`

**Step 1: Import component and fetch data**

Add import at the top:

```astro
import WeeklyTrendChart from "@/components/sections/WeeklyTrendChart.astro";
```

Add data fetching after the existing countyData fetch (around line 15):

```astro
// Fetch weekly trend data for this county
const weeklyResponse = await fetch(`${Astro.url.origin}/api/stats/weekly/county/${countyName}.json`);
const weeklyResult = await weeklyResponse.json();
const weeklyData = weeklyResult.success ? weeklyResult.data : [];
```

**Step 2: Add component to template**

Insert after the "Sensor Locations" section (after the sensors list, around line 155), before the closing "Footer Note" div:

```astro
<!-- Weekly Trend Section -->
{weeklyData && weeklyData.length > 0 && (
  <div class="mt-20">
    <div class="neon-divider-pink mb-12"></div>
    <WeeklyTrendChart
      data={weeklyData}
      title={`${countyData.county}'s Weekly Trends`}
      accentColor="pink"
      subtitle="52 weeks of cycling activity"
    />
  </div>
)}
```

**Step 3: Verify changes**

Run: `grep -n "WeeklyTrendChart" src/pages/county/[slug].astro`
Expected: Shows import and usage.

**Step 4: Test locally**

With dev server running, visit: `http://localhost:4321/county/dublin`
Expected: Page loads with weekly trend section for county.

**Step 5: Commit**

```bash
git add src/pages/county/[slug].astro
git commit -m "feat: add weekly trend chart to county pages"
```

---

## Phase 5: Testing & Polish

### Task 13: Run tests and type checking

**Files:**
- Existing test files

**Step 1: Type check**

Run: `npm run test:typecheck`
Expected: PASS with zero errors.

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass (or confirm no regressions).

**Step 3: Build for production**

Run: `npm run build`
Expected: Build succeeds, no errors.

**Step 4: Commit**

```bash
git add .
git commit -m "test: verify type checking and builds pass"
```

---

### Task 14: Manual testing checklist

**Files:**
- No code changes (testing only)

**Step 1: Local development test**

Run: `npm run dev:wrangler`
Visit national dashboard: `http://localhost:4321`
Verify:
- ✅ Weekly trend section displays below county leaderboard
- ✅ Chart renders with neon-green accent
- ✅ Title shows "National Weekly Trends"

Visit county page: `http://localhost:4321/county/dublin`
Verify:
- ✅ Weekly trend section displays before footer
- ✅ Chart renders with neon-pink accent
- ✅ Title shows county name

**Step 2: API endpoint test**

Run:
```bash
curl http://localhost:4321/api/stats/weekly/national.json | jq .
curl http://localhost:4321/api/stats/weekly/county/Dublin.json | jq .
```

Verify:
- ✅ Returns success: true
- ✅ Data is array of weekly objects
- ✅ Each has week_ending (YYYY-MM-DD) and total_bikes

**Step 3: Production preview**

Run: `npm run preview`
Visit: `http://localhost:3000`
Verify:
- ✅ Site renders correctly
- ✅ Weekly charts display with proper styling
- ✅ Cache headers are set (check Network tab: Cache-Control header)

**Step 4: No formal commit needed**

Manual testing doesn't require a commit.

---

### Task 15: Copy & Messaging (Optional but recommended)

**Files:**
- No files changed (copywriting request only)

**Step 1: Request copy from irish-cycling-copywriter agent**

Once weekly data is actually flowing, use the irish-cycling-copywriter agent to generate:

1. **National dashboard intro** (≤10 words, punchy)
2. **County pages intro** (context-specific, punchy)

**Example request structure:**
- "Here's the national weekly cycling data for Ireland. Generate a punchy tagline/intro line (≤10 words) for the weekly trend chart section on the national dashboard."
- For counties: "Here's [County]'s weekly cycling data. Generate a punchy intro line for their weekly trend chart."

**Step 2: Update copy in components**

Once copy is approved, update the hardcoded text in both pages and commit.

**No commit at this stage** - wait for copy approval.

---

## Testing Strategy

**Unit Tests:**
- Test database functions: `getNationalWeeklyStats`, `getCountyWeeklyStats`
- Test API endpoints return correct shape and cache headers
- Add tests in `tests/utils/db.test.ts` and `tests/pages/api/...`

**Integration Tests:**
- Test full flow: Data ingestion → Weekly aggregation → API response
- Run weekly worker locally, verify `sensor_weekly_stats` is populated
- Test from multiple counties to verify aggregation

**Manual Testing:**
- Verify charts render correctly on mobile/tablet/desktop
- Verify cache headers are applied (1 hour for weekly data)
- Verify responsiveness with varying data sizes

---

## Rollout Plan

1. **Deploy infrastructure** (database, worker) → Verify aggregation runs
2. **Deploy API endpoints** → Test with real data
3. **Deploy components** → Visual regression testing
4. **Monitor** → Check for data freshness, API performance, worker reliability

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **No data in first week** | Charts appear empty | Expected; aggregation runs first Sunday. Document in release notes. |
| **Database size growth** | Increased costs | Index the hourly data aggressively; consider archiving after 1-2 years. |
| **Worker fails to run** | Weekly stats stale | Monitoring endpoint tracks worker health; set up alerts. |
| **Chart library performance** | Slow renders | Use static SVG (no JS library). Verify on slow devices. |

---

## Success Criteria

- ✅ Weekly trend charts display on national dashboard
- ✅ Weekly trend charts display on all county pages
- ✅ Charts render correctly on mobile, tablet, desktop
- ✅ API endpoints respond in <100ms (cached)
- ✅ Weekly aggregation worker runs reliably every Sunday
- ✅ Velvet & Neon design applied (green national, pink counties)
- ✅ Copy matches Irish cycling voice (punchy, data-grounded)
- ✅ 365 days of hourly data retained
- ✅ Zero TypeScript errors
- ✅ All tests pass

---

## Files Changed Summary

**Database:**
- `db/schema.sql` - Indexes + new table
- `db/migrations/0002_create_weekly_stats_table.sql` - New migration

**Workers:**
- `workers/update-sensor-data/index.ts` - Extend retention to 365 days
- `workers/aggregate-weekly-stats/` - New worker (index.ts, wrangler.toml, package.json)

**API:**
- `src/utils/db.ts` - Add weekly stats functions
- `src/pages/api/stats/weekly/national.json.ts` - New endpoint
- `src/pages/api/stats/weekly/county/[county].json.ts` - New endpoint

**Frontend:**
- `src/components/sections/WeeklyTrendChart.astro` - New component
- `src/pages/index.astro` - Add chart to national dashboard
- `src/pages/county/[slug].astro` - Add chart to county pages

**Total: 10 files modified/created across 5 phases**
