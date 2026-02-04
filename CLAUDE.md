# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"The Ride" is an Astro-based cycling data visualization platform deployed on Cloudflare. The site showcases real-time bike counts from Telraam sensors across Ireland with a distinctive "Velvet & Neon" design aesthetic. The site uses server-side rendering (SSR) with the Cloudflare adapter and Cloudflare D1 for data storage.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Start local dev server at localhost:4321 (basic, no D1 bindings)
npm run dev

# Start dev server WITH D1 database bindings (RECOMMENDED)
npm run dev:wrangler

# Type-check and build for production
npm run build

# Preview production build locally with Cloudflare bindings
npm run preview

# Run Astro CLI commands
npm run astro -- <command>
```

**Important:** For development with D1 database access, always use `npm run dev:wrangler` instead of `npm run dev`.

## Testing

```bash
# Run all tests (unit tests + TypeScript checks)
npm test

# Run unit tests only
npm run test:unit

# Run unit tests in watch mode (for development)
npm run test:unit:watch

# Run TypeScript type checking only
npm run test:typecheck

# Run tests with coverage report
npm run test:coverage
```

**Test Structure:**
- `tests/` - All test files (mirrors src/ structure)
- `tests/utils/` - Utility function tests
- `tests/schemas/` - Zod schema validation tests
- `vitest.config.ts` - Vitest configuration with path aliases

**Writing Tests:**
- Use Vitest for unit and integration tests
- Test files: `*.test.ts` pattern
- Import test functions: `import { describe, it, expect } from 'vitest'`
- Path aliases work in tests: `import { foo } from '@/utils/foo'`

**CI/CD:**
- GitHub Actions runs `npm test` on all PRs and pushes to main
- TypeScript checks enforce zero compilation errors
- All tests must pass before merge

## Architecture

### Tech Stack
- **Framework**: Astro 5.x with SSR (`output: 'server'`)
- **Styling**: Tailwind CSS with custom theme configuration
- **Deployment**: Cloudflare (via @astrojs/cloudflare adapter)
- **Database**: Cloudflare D1 (SQLite-based edge database)
- **Font**: Space Grotesk (custom web fonts)
- **Smooth Scrolling**: Lenis library

### Project Structure

```
src/
├── pages/                  # File-based routing
│   ├── index.astro         # National dashboard (homepage)
│   ├── county/
│   │   └── [slug].astro    # Dynamic county pages (hot pink neon theme)
│   └── api/
│       └── stats/
│           ├── national.json.ts      # National statistics endpoint
│           ├── counties.json.ts      # County leaderboard endpoint
│           └── county/
│               └── [county].json.ts  # County details endpoint
├── layouts/                # Page templates
│   ├── MinimalLayout.astro # Primary layout for dashboard pages
│   └── MainHead.astro      # <head> tag configuration
├── components/
│   ├── sections/
│   │   └── CountyLeaderboard.astro   # Top 3 counties podium display
│   ├── ui/                 # Reusable UI components
│   └── seo/                # SEO components
├── styles/
│   └── global.css          # Tailwind config + Velvet & Neon custom styles
├── utils/
│   └── db.ts               # D1 database utility functions
└── workers/
    └── update-sensor-data.ts # Cloudflare Worker for Telraam API sync
```

### Key Routes

- `/` - National dashboard with aggregated bike counts and county leaderboard
- `/county/{slug}` - County-specific pages (dublin, cork, clare, galway, kildare, mayo, meath, wexford)
  - Features hot pink neon theme to differentiate from national dashboard
  - Shows total bikes, average per sensor, and all sensor listings
  - Each sensor links to Telraam website: `https://telraam.net/en/location/{segment_id}`
- `/api/stats/national.json` - National aggregated statistics
- `/api/stats/counties.json` - Top counties by bike count (default limit: 3)
- `/api/stats/county/{county}.json` - Detailed county data with all sensors

### Key Conventions

**Content Collections**: Blog posts use Astro's content collections with a Zod schema defined in `src/content/config.ts`. Required frontmatter fields:
- `title`, `pubDate` (Date), `author`, `authImage`, `image`, `tags` (array), `summary`, `type` (Article|Tutorial)

**Path Aliases**: TypeScript is configured with `@/*` mapping to `src/*` for imports.

**Styling System - Velvet & Neon Design**:
- **Velvet Base Colors** (defined in `src/styles/global.css`):
  - `--velvet-black: #0a0a0a` - Matte black, primary background
  - `--velvet-charcoal: #1a1a1a` - Deep charcoal, secondary background
  - `--velvet-midnight: #0d1117` - Midnight, card backgrounds
- **Neon Accent Colors**:
  - `--neon-green: #39FF14` - Electric neon green, primary cycling accent
  - `--neon-yellow: #CCFF00` - Hi-viz yellow, building-site aesthetic
  - `--neon-cyan: #00F0FF` - Electric cyan, data visualization
  - `--neon-pink: #FF10F0` - Hot pink, county pages accent
- **Glow Effects**: `--glow-green`, `--glow-yellow`, `--glow-cyan`, `--glow-pink` (normal and strong variants)
- **Custom Classes**:
  - Button classes: `.btn-primary`, `.btn-secondary`, `.btn-tertiary`
  - Heading highlights: `.greenhead`, `.yellowhead`, `.neonhead`, `.pinkhead`
  - Text glow: `.text-glow-green`, `.text-glow-yellow`, `.text-glow-pink`
  - Neon borders: `.neon-border-green`, `.neon-border-yellow`, `.neon-border-pink`
  - Dividers: `.neon-divider`, `.neon-divider-pink`
  - Animations: `.neon-pulse`, `.neon-pulse-pink`

**Smooth Scrolling**: Lenis is initialized via `src/utils/lenis.js` and loaded in the MainLayout. Custom CSS classes handle Lenis states (`.lenis`, `.lenis-smooth`, `.lenis-stopped`).

**Utility Functions**: `src/utils.ts` provides `formatDate()` and `capitalize()` helpers.

## Database (Cloudflare D1)

The project uses Cloudflare D1, a SQLite-based edge database for storing Telraam traffic sensor data.

### Database Commands

```bash
# Create the database (first time only)
npx wrangler d1 create theride-db
# Then update database_id in wrangler.toml

# Run schema (production)
npx wrangler d1 execute theride-db --file=./db/schema.sql

# Run migrations (production)
npx wrangler d1 execute theride-db --file=./db/migrations/0001_seed_sensor_locations.sql

# Local development - create and seed
npx wrangler d1 execute theride-db --local --file=./db/schema.sql
npx wrangler d1 execute theride-db --local --file=./db/migrations/0001_seed_sensor_locations.sql

# Query database
npx wrangler d1 execute theride-db --command "SELECT * FROM sensor_locations"
npx wrangler d1 execute theride-db --local --command "SELECT * FROM sensor_locations"
```

### Database Access in Code

The D1 database is available via `locals.runtime.env.DB` in API routes and pages:

```typescript
const db = locals.runtime.env.DB;
const { results } = await db
  .prepare('SELECT * FROM sensor_locations WHERE segment_id = ?')
  .bind(segmentId)
  .all<SensorLocation>();
```

### Sensor Locations Schema

The `sensor_locations` table stores Telraam traffic sensor data:
- **segment_id**: Unique sensor identifier (primary key)
- **last_data_package**: Timestamp of last data update
- **timezone**: Sensor timezone
- **date**: Measurement date
- **period**: Aggregation period (hourly, daily, monthly)
- **uptime**: Operational uptime percentage (0-1)
- **heavy, car, bike, pedestrian**: Vehicle/pedestrian counts
- **v85**: 85th percentile speed (km/h)
- **latitude, longitude**: GPS coordinates
- **created_at, updated_at**: Record timestamps

See `db/schema.sql` for full schema and `db/README.md` for detailed database documentation.

## Deployment

The site is configured for Cloudflare deployment. The Astro config uses the Cloudflare adapter with SSR enabled. The `.wrangler` directory contains build artifacts (not committed to git).

Database bindings are configured in `wrangler.toml`. Ensure database migrations are run on production before deploying.

Note: The `site` field in `astro.config.mjs` still references the old Vercel URL and should be updated if needed.

## Cloudflare Workers

The project uses scheduled Cloudflare Workers for background tasks. Workers are located in the `workers/` directory, each in its own subdirectory with isolated configuration.

### Worker Directory Structure

```
workers/
├── update-sensor-data/         # Daily sensor data sync
│   ├── index.ts                # Worker logic
│   ├── wrangler.toml           # Worker-specific config
│   ├── package.json            # Dependencies
│   └── tsconfig.json           # TypeScript config
└── scrape-location-names/      # Weekly location name scraper
    ├── index.ts
    ├── wrangler.toml
    ├── package.json
    └── tsconfig.json
```

### Deploying Workers

**CRITICAL**: Each worker has its own `wrangler.toml` configuration. Because there's also a root `wrangler.toml` for the main site, you MUST use the `-c wrangler.toml` flag when deploying workers to avoid deploying the wrong project.

```bash
# CORRECT - Deploy a specific worker
cd workers/scrape-location-names
npm run deploy
# OR manually:
npx wrangler deploy -c wrangler.toml

# WRONG - This will deploy the main site instead!
cd workers/scrape-location-names
npx wrangler deploy  # ❌ Missing -c flag
```

### Worker npm Scripts Pattern

All workers should include these npm scripts in their `package.json`:

```json
{
  "scripts": {
    "dev": "wrangler dev -c wrangler.toml",
    "deploy": "wrangler deploy -c wrangler.toml",
    "tail": "wrangler tail <worker-name>"
  }
}
```

### Creating New Workers

When creating a new worker:

1. Create directory: `workers/<worker-name>/`
2. Create `wrangler.toml` with unique `name` field
3. Create `package.json` with scripts that use `-c wrangler.toml`
4. Create `index.ts` with worker logic
5. Create `tsconfig.json` (copy from existing worker)
6. Deploy using: `npm run deploy`

### Existing Workers

- **update-sensor-data**: Runs daily at 23:59 UTC to fetch hourly traffic data from Telraam API
- **scrape-location-names**: Runs weekly (Sunday 2:00 AM UTC) to scrape location names from Telraam pages

### Worker Development

```bash
# Local development with test triggers
cd workers/<worker-name>
npm run dev

# View production logs
npm run tail

# Trigger scheduled worker manually (via Cloudflare dashboard)
# Workers & Pages > <worker-name> > Triggers > Cron Triggers > "Send test event"
```

### Common Pitfall

**Problem**: Running `npx wrangler deploy` from a worker directory deploys the main site instead.

**Root Cause**: Wrangler searches up the directory tree for `wrangler.toml` and finds the root config first.

**Solution**: Always use `-c wrangler.toml` flag or use `npm run deploy` which includes the flag.
