# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Astro-based static website (originally based on the "Positivus" theme for digital marketing agencies) deployed on Cloudflare. The site uses server-side rendering (SSR) with the Cloudflare adapter.

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
├── pages/           # File-based routing
│   ├── index.astro  # Homepage
│   ├── about.astro
│   ├── pricing.astro
│   ├── services/    # Nested routes
│   └── articles/    # Blog with dynamic routes
│       ├── [...slug].astro      # Individual article pages
│       ├── tag/[...tag].astro   # Tag filtering
│       └── api/search.json.ts   # Search API endpoint
├── layouts/         # Page templates
│   ├── MainLayout.astro  # Primary layout with Navbar/Footer
│   └── MainHead.astro    # <head> tag configuration
├── components/
│   ├── sections/    # Large page sections (Hero, Contact, etc.)
│   ├── ui/          # Reusable UI components
│   ├── seo/         # SEO components
│   └── Icons/       # Icon components
├── content/
│   ├── blog/        # Markdown blog posts
│   └── config.ts    # Content collection schema (Zod)
├── data/            # Static JSON data files
├── styles/
│   └── global.css   # Tailwind config + custom styles
└── utils/           # Helper functions and scripts
```

### Key Conventions

**Content Collections**: Blog posts use Astro's content collections with a Zod schema defined in `src/content/config.ts`. Required frontmatter fields:
- `title`, `pubDate` (Date), `author`, `authImage`, `image`, `tags` (array), `summary`, `type` (Article|Tutorial)

**Path Aliases**: TypeScript is configured with `@/*` mapping to `src/*` for imports.

**Styling System**:
- CSS custom properties defined in `src/styles/global.css` (colors: `--green`, `--black`, `--dark`, `--gray`, `--white`)
- Custom button classes: `.btn-primary`, `.btn-secondary`, `.btn-tertiary`
- Custom heading highlight classes: `.greenhead`, `.whitehead`, `.blackhead`
- Custom font outline utilities: `.font-outline`, `.font-outline-sm`

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
