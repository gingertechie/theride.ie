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
