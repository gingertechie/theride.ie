# Worker Deployment Instructions

After implementing retry logic, both workers need to be deployed to production.

## Deploy Commands

### Update Sensor Data Worker

```bash
cd workers/update-sensor-data
npm run deploy
```

### Scrape Location Names Worker

```bash
cd workers/scrape-location-names
npm run deploy
```

## Deployment Verification

After deploying, verify the workers are running:

1. Check worker logs:
   ```bash
   cd workers/update-sensor-data
   npm run tail
   ```

2. Trigger a test run from Cloudflare Dashboard:
   - Go to Workers & Pages
   - Select the worker
   - Click "Triggers" tab
   - Click "Send test event" under Cron Triggers

3. Monitor logs for retry behavior:
   - Look for log entries like: "Retryable error (429) on attempt 1/4. Retrying in 2000ms..."
   - Confirm successful retries complete with data fetched

## Recent Changes

**2026-02-03**: Added exponential backoff retry logic
- Retries on 5xx errors and 429 rate limits
- 3 retries max with exponential backoff (2s, 4s, 8s)
- 10 second max delay cap
- Shared utility in `workers/shared/fetch-with-retry.ts`
