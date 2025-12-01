# The Ride - Ireland's Cycling Data Visualization

The Ride is a data visualization platform showcasing cycling statistics from Telraam sensors across Ireland. Built with Astro and featuring a distinctive "Velvet & Neon" design aesthetic, the platform provides real-time insights into bike counts across Irish counties.

[![Static Badge](https://img.shields.io/badge/Astro-orange)](https://astro.build/)
[![Static Badge](https://img.shields.io/badge/Cloudflare-blue)](https://www.cloudflare.com/)
[![Static Badge](https://img.shields.io/badge/D1_Database-purple)](https://developers.cloudflare.com/d1/)

## Features

- **National Dashboard**: Real-time aggregated bike counts from sensors across Ireland
- **County Leaderboard**: Top counties ranked by total bike rides
- **County Pages**: Detailed statistics and sensor listings for each county (hot pink neon theme)
- **Sensor Data**: Links to individual Telraam sensors for detailed traffic data
- **Velvet & Neon Design**: Dark, rich backgrounds with vibrant neon accents (green, yellow, cyan, pink)
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Real-time Updates**: Data synced from Telraam API via Cloudflare Workers

## Design System

The platform uses a "Velvet & Neon" aesthetic:

- **Velvet Base Colors**: Deep blacks and charcoals (#0a0a0a, #1a1a1a)
- **Neon Accents**:
  - Green (#39FF14) - Primary cycling accent
  - Yellow (#CCFF00) - Hi-viz, building-site aesthetic
  - Cyan (#00F0FF) - Data visualization
  - Pink (#FF10F0) - County pages accent
- **Typography**: Space Grotesk font family
- **Effects**: Glow animations, pulsing neon borders, text shadows

## 🚀 Project Structure

```
src/
├── pages/
│   ├── index.astro              # National dashboard (homepage)
│   ├── county/
│   │   └── [slug].astro         # Dynamic county pages (hot pink theme)
│   └── api/
│       └── stats/
│           ├── national.json.ts # National statistics endpoint
│           ├── counties.json.ts # County leaderboard endpoint
│           └── county/
│               └── [county].json.ts # County details endpoint
├── components/
│   ├── sections/
│   │   └── CountyLeaderboard.astro # Top 3 counties podium display
│   └── ui/                      # Reusable UI components
├── layouts/
│   └── MinimalLayout.astro      # Primary layout with Velvet & Neon theme
├── styles/
│   └── global.css               # Tailwind + custom neon styles
├── utils/
│   └── db.ts                    # D1 database utility functions
└── workers/
    └── update-sensor-data.ts    # Cloudflare Worker for Telraam API sync
```

### Key Routes

- `/` - National dashboard with total bike counts and county leaderboard
- `/county/{slug}` - County-specific pages (dublin, cork, clare, galway, kildare, mayo, meath, wexford)
- `/api/stats/national.json` - National aggregated statistics
- `/api/stats/counties.json` - Top counties by bike count
- `/api/stats/county/{county}.json` - Detailed county data with all sensors

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321` (no D1 bindings) |
| `npm run dev:wrangler`    | **Recommended**: Starts dev server WITH D1 database bindings |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally with Cloudflare bindings |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |

### Database Commands

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npx wrangler d1 create theride-db` | Create the D1 database (first time only) |
| `npx wrangler d1 execute theride-db --local --file=./db/schema.sql` | Create local database tables |
| `npx wrangler d1 execute theride-db --local --file=./db/migrations/0001_seed_sensor_locations.sql` | Seed local database with sensor data |
| `npx wrangler d1 execute theride-db --local --command "SELECT * FROM sensor_locations"` | Query local database |

See `db/README.md` for detailed database documentation.

## County Pages

Each county has a dedicated page with:

- **Total Bike Rides**: Aggregated bike counts from all sensors in the county
- **Average per Sensor**: Mean bike count across all active sensors
- **Sensor Listings**: Complete list of all Telraam sensors in the county
- **Sensor Details**: For each sensor:
  - Segment ID with link to Telraam website
  - Location name and coordinates
  - Bike, car, and pedestrian counts
  - Interactive hover effects with hot pink neon glow
- **Hot Pink Neon Theme**: Distinctive pink accents to differentiate from national dashboard

### Accessing County Pages

County pages use URL slugs (e.g., `/county/dublin`, `/county/cork`). The slug-to-county mapping:

- `dublin` → County Dublin
- `cork` → County Cork
- `clare` → County Clare
- `galway` → County Galway
- `kildare` → County Kildare
- `mayo` → County Mayo
- `meath` → County Meath
- `wexford` → County Wexford

## Data Source

All cycling data comes from [Telraam](https://telraam.net) traffic sensors. Data is updated automatically via a Cloudflare Worker that syncs with the Telraam API.

## 👀 Want to learn more?

Feel free to check [Astro documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
