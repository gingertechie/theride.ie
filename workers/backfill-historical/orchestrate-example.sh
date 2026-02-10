#!/bin/bash
# orchestrate-example.sh - Example orchestration script for backfilling historical data
#
# Usage: ./orchestrate-example.sh
#
# This script demonstrates how to call the HTTP backfill worker for multiple sensors
# with proper error handling and rate limit management.

set -euo pipefail

# Configuration
WORKER_URL="https://backfill-historical.YOUR-SUBDOMAIN.workers.dev/backfill"
BACKFILL_SECRET="YOUR-SECRET-TOKEN"  # Set your auth token from Cloudflare env vars
START_DATE="20240101"  # Adjust to your desired start date
END_DATE="20240131"    # Adjust to your desired end date

# List of sensor IDs to backfill (replace with your sensors)
SENSORS=(
  "9000001435"
  "9000001437"
  "9000007890"
)

# Statistics
TOTAL_SENSORS=${#SENSORS[@]}
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

echo "=================================================="
echo "Backfill Orchestration"
echo "=================================================="
echo "Worker URL: $WORKER_URL"
echo "Date Range: $START_DATE to $END_DATE"
echo "Total Sensors: $TOTAL_SENSORS"
echo "=================================================="
echo ""

for i in "${!SENSORS[@]}"; do
  sensor_id="${SENSORS[$i]}"
  sensor_num=$((i + 1))

  echo "[$sensor_num/$TOTAL_SENSORS] Processing sensor $sensor_id..."

  # Make request and capture both body and status code
  response=$(curl -s -w "\n%{http_code}" \
    -H "X-Backfill-Secret: $BACKFILL_SECRET" \
    "$WORKER_URL?sensor_id=$sensor_id&start_date=$START_DATE&end_date=$END_DATE")

  # Extract status code (last line)
  status_code=$(echo "$response" | tail -n1)

  # Extract body (all except last line)
  body=$(echo "$response" | head -n-1)

  # Handle different status codes
  case $status_code in
    200)
      echo "  ✅ Success"
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      ;;
    404)
      echo "  ⚠️  No data available (skipped)"
      SKIP_COUNT=$((SKIP_COUNT + 1))
      ;;
    429)
      echo "  ⏳ Rate limited - sleeping 60 seconds..."
      sleep 60
      echo "  🔄 Retrying sensor $sensor_id..."
      # Retry once after rate limit
      response=$(curl -s -w "\n%{http_code}" \
        -H "X-Backfill-Secret: $BACKFILL_SECRET" \
        "$WORKER_URL?sensor_id=$sensor_id&start_date=$START_DATE&end_date=$END_DATE")
      status_code=$(echo "$response" | tail -n1)
      if [ "$status_code" = "200" ]; then
        echo "  ✅ Success on retry"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      else
        echo "  ❌ Failed on retry (status: $status_code)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
      fi
      ;;
    540)
      echo "  ❌ R2 storage failure"
      echo "  Error details:"
      echo "$body" | grep "Error:" || true
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
    *)
      echo "  ❌ Failed with status $status_code"
      echo "  Error details:"
      echo "$body" | grep "Error:" || true
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
  esac

  # Polite delay between requests (except on last sensor)
  if [ $sensor_num -lt $TOTAL_SENSORS ]; then
    sleep 5
  fi

  echo ""
done

# Summary
echo "=================================================="
echo "Backfill Complete"
echo "=================================================="
echo "Total: $TOTAL_SENSORS"
echo "Success: $SUCCESS_COUNT"
echo "Skipped: $SKIP_COUNT"
echo "Failed: $FAIL_COUNT"
echo "=================================================="

# Exit with error if any failures
if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
