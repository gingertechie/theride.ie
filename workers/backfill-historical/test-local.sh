#!/bin/bash
# Local testing script for backfill-historical worker
#
# This script runs the worker locally with conservative settings:
# - BATCH_SIZE=2 (just 2 sensors)
# - BACKFILL_DAYS=7 (just 1 week of data)
# - Uses local D1 database
# - Will make 2 API calls to Telraam (minimal impact)

set -e

echo "🧪 Testing backfill-historical worker locally..."
echo ""
echo "Configuration:"
echo "  - BATCH_SIZE: 2 sensors"
echo "  - BACKFILL_DAYS: 7 days"
echo "  - API calls: 2 (one per sensor)"
echo "  - Database: Local D1"
echo ""

# Check if TELRAAM_API_KEY is set
if [ -z "$TELRAAM_API_KEY" ]; then
  echo "❌ Error: TELRAAM_API_KEY environment variable is not set"
  echo ""
  echo "Please set it first:"
  echo "  export TELRAAM_API_KEY='your-api-key-here'"
  exit 1
fi

echo "✅ TELRAAM_API_KEY is set"
echo ""

# Show current local data
echo "📊 Current local database state:"
npx wrangler d1 execute theride-db --local --command \
  'SELECT segment_id, MIN(hour_timestamp) as oldest, MAX(hour_timestamp) as newest, COUNT(*) as hours FROM sensor_hourly_data GROUP BY segment_id ORDER BY segment_id LIMIT 5' 2>/dev/null || echo "  (No data yet)"
echo ""

read -p "Press Enter to run the worker, or Ctrl+C to cancel..."
echo ""

# Run the worker with test scheduled event
echo "🚀 Starting worker in dev mode..."
echo ""
echo "⚠️  In another terminal, trigger the scheduled event with:"
echo "    curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'"
echo ""

npx wrangler dev --local
