# Monitoring and Alerting Guide

This guide documents how to set up external monitoring and alerting for The Ride platform to detect worker failures and data staleness.

## Overview

The Ride uses Cloudflare Workers to sync sensor data from the Telraam API. These workers run on schedules:
- **update-sensor-data**: Daily at 23:59 UTC
- **scrape-location-names**: Weekly (Sunday 2:00 AM UTC)

If these workers fail, data becomes stale without detection. This guide sets up:
1. External health check monitoring (UptimeRobot)
2. Cloudflare Worker failure alerts
3. Alert response procedures

## Monitoring Endpoint

The platform provides a monitoring endpoint at:
```
https://theride.ie/api/stats/monitoring.json
```

**Response Format:**
```json
{
  "status": "healthy",
  "is_healthy": true,
  "timestamp": "2026-02-03T12:00:00.000Z",
  "data_freshness": {
    "most_recent_data": "2026-02-03T11:00:00.000Z",
    "hours_since_last_data": 1,
    "is_stale": false
  },
  "worker_status": {
    "worker_likely_ran": true,
    "hours_since_expected_run": 12,
    "next_expected_run": "2026-02-03T23:59:00.000Z"
  },
  "sensor_stats": {
    "total_sensors": 73,
    "sensors_with_recent_data": 68,
    "sensors_missing_data": 5
  }
}
```

**Health Indicators:**
- `is_healthy`: Overall health status (false if data is stale OR worker likely failed)
- `data_freshness.is_stale`: True if most recent data is >26 hours old
- `worker_status.worker_likely_ran`: False if >27 hours since expected daily run
- `sensor_stats.sensors_missing_data`: Count of sensors with no data in last 24 hours

**Cache Headers:**
```
Cache-Control: public, max-age=300, s-maxage=300
```
The endpoint is cached for 5 minutes to prevent monitoring spam while remaining responsive.

## 1. External Health Check Setup (UptimeRobot)

### Why UptimeRobot?

- Free tier includes 50 monitors
- Checks every 5 minutes (free tier)
- JSON path validation support
- Email, SMS, Slack, webhook notifications
- Public status pages
- No credit card required

### Setup Steps

#### 1.1 Create UptimeRobot Account

1. Go to https://uptimerobot.com/
2. Sign up for free account
3. Verify email address
4. Log in to dashboard

#### 1.2 Create Monitor

1. Click **"+ Add New Monitor"**
2. Configure monitor:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: The Ride - Health Check
   - **URL**: `https://theride.ie/api/stats/monitoring.json`
   - **Monitoring Interval**: 5 minutes (free tier)
   - **Monitor Timeout**: 30 seconds

#### 1.3 Configure Keyword Monitoring

1. Expand **"Advanced Settings"**
2. Enable **"Keyword Monitoring"**
3. Set **Keyword Type**: "Keyword exists"
4. Set **Keyword**: `"is_healthy":true`
5. **Alert when**: Keyword not found (this triggers when `is_healthy: false`)

#### 1.4 Set Up Alert Contacts

1. Go to **"My Settings" > "Alert Contacts"**
2. Add contacts:
   - Email (verified automatically)
   - SMS (optional, requires phone verification)
   - Slack webhook (recommended for team alerts)
   - PagerDuty, Discord, etc. (optional)

3. For each contact, configure:
   - When to send alerts: "Send notifications"
   - Threshold: Alert when down for X checks (recommend: 2 checks = 10 minutes)

#### 1.5 Configure Alert Frequency

In monitor settings:
- **Alert When**: Down
- **After X minutes**: 10 (wait for 2 failed checks before alerting)
- **Re-alert if still down**: Every 60 minutes
- **Alert Contacts**: Select your configured contacts

### 1.6 Optional: Create Public Status Page

1. Go to **"Public Status Pages"**
2. Click **"Add New Status Page"**
3. Configure:
   - **Friendly Name**: The Ride Status
   - **Custom URL**: `the-ride-status` (creates https://stats.uptimerobot.com/the-ride-status)
   - **Monitors to Display**: Select "The Ride - Health Check"
   - **Show Uptime**: Yes
   - **Response Time Chart**: Yes

4. Share status page URL with stakeholders

## 2. Cloudflare Worker Alerts

Cloudflare can send alerts directly when workers fail.

### 2.1 Enable Worker Analytics

1. Log in to Cloudflare Dashboard: https://dash.cloudflare.com/
2. Go to **Workers & Pages**
3. Select **update-sensor-data** worker
4. Go to **Metrics** tab
5. Verify metrics are being collected (requests, errors, duration)

### 2.2 Create Notification Webhook

**Option A: Slack Webhook** (Recommended)

1. In Slack workspace, go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. Name: "Cloudflare Worker Alerts"
4. Select workspace
5. Go to **"Incoming Webhooks"** → Enable
6. Click **"Add New Webhook to Workspace"**
7. Select channel (e.g., `#alerts`)
8. Copy webhook URL (format: `https://hooks.slack.com/services/...`)

**Option B: Email**

Use your email address directly (no setup required).

**Option C: PagerDuty / OpsGenie**

Configure integration according to service documentation.

### 2.3 Configure Cloudflare Notifications

1. In Cloudflare Dashboard, go to **Notifications**
2. Click **"Add"**
3. Select notification type:

**For Worker Script Errors:**
- **Event Type**: Workers - Script Threw Exception
- **Name**: "Worker Script Error - update-sensor-data"
- **Workers**: Select `update-sensor-data`
- **Delivery Method**: Add webhook or email from step 2.2

**For Worker CPU Time Exceeded:**
- **Event Type**: Workers - CPU Time Exceeded
- **Name**: "Worker Timeout - update-sensor-data"
- **Workers**: Select `update-sensor-data`
- **Delivery Method**: Same as above

**For High Error Rate:**
- **Event Type**: Workers - High Error Rate
- **Name**: "Worker High Error Rate - update-sensor-data"
- **Workers**: Select `update-sensor-data`
- **Threshold**: 5% error rate over 15 minutes
- **Delivery Method**: Same as above

4. Repeat for **scrape-location-names** worker

### 2.4 Test Notifications

1. Go to **Workers & Pages** → **update-sensor-data**
2. Go to **Settings** → **Triggers** → **Cron Triggers**
3. Click **"Send test event"** (manually trigger worker)
4. Check worker logs in **Logs** tab
5. If worker succeeds, no alert should fire
6. To test failure alert (optional):
   - Temporarily introduce error in worker code
   - Deploy and trigger test event
   - Verify alert is received
   - Revert code and redeploy

## 3. Alert Response Procedures

### When You Receive an Alert

#### 3.1 Initial Assessment

1. Check the monitoring endpoint directly:
   ```bash
   curl -s https://theride.ie/api/stats/monitoring.json | jq
   ```

2. Identify the issue:
   - **is_healthy: false** → Check data_freshness and worker_status
   - **data_freshness.is_stale: true** → Data hasn't been updated in 26+ hours
   - **worker_likely_ran: false** → Worker hasn't run in 27+ hours
   - **sensors_missing_data > 10** → Multiple sensors offline or API issue

#### 3.2 Check Worker Logs

1. Go to Cloudflare Dashboard → **Workers & Pages**
2. Select **update-sensor-data**
3. Go to **Logs** tab
4. Check recent logs for:
   - Script errors or exceptions
   - API timeouts (Telraam API down)
   - Database errors (D1 issues)
   - Rate limit errors

**Using CLI:**
```bash
cd workers/update-sensor-data
npm run tail
```

#### 3.3 Check Worker Execution History

1. In Worker page, go to **Metrics** tab
2. Check:
   - **Requests**: Should show daily spike at 23:59 UTC
   - **Errors**: Should be 0% or very low
   - **Duration**: Should be <30 seconds (usually 15-20s)
   - **CPU Time**: Should be <1000ms

If no requests show up for last 24 hours, cron trigger failed to fire.

### 3.4 Common Issues and Fixes

**Issue: Worker didn't run (no requests in metrics)**

- **Cause**: Cron trigger disabled or Cloudflare issue
- **Fix**:
  1. Check **Triggers** tab → **Cron Triggers** → Verify trigger is enabled
  2. Manually trigger: Click **"Send test event"**
  3. If successful, monitor next scheduled run
  4. If cron trigger is disabled, re-enable it

**Issue: Worker ran but threw error**

- **Cause**: Code bug, API change, or database issue
- **Fix**:
  1. Review error in logs
  2. If Telraam API error, check https://telraam.net/en/api-status
  3. If D1 error, check Cloudflare status page
  4. If code error, fix and redeploy:
     ```bash
     cd workers/update-sensor-data
     # Fix code in index.ts
     npm run deploy
     ```
  5. Manually trigger to verify fix

**Issue: Worker ran but data still stale**

- **Cause**: Telraam API returned no new data
- **Fix**:
  1. Check Telraam API status: https://telraam.net/en/support
  2. Manually query Telraam API for a known sensor:
     ```bash
     curl -H "X-Api-Key: $TELRAAM_API_KEY" \
       "https://telraam-api.net/v1/reports/traffic?level=segments&format=per-hour&id=9000004360"
     ```
  3. If Telraam API is down, wait for resolution
  4. If API is up but no data, may be legitimate (sensors offline)

**Issue: High sensor_missing_data count**

- **Cause**: Multiple sensors offline or API rate limit hit
- **Fix**:
  1. Check if specific county affected (e.g., all Meath sensors)
  2. Review worker logs for rate limit errors
  3. If rate limit hit, worker will retry tomorrow
  4. If sensors genuinely offline, no action needed (wait for Telraam to fix)

**Issue: Worker timeout (CPU time exceeded)**

- **Cause**: Too many sensors or slow API responses
- **Fix**:
  1. Check worker duration in metrics (should be <30s)
  2. If consistently timing out, consider:
     - Reducing `SENSORS_PER_BATCH` in worker config
     - Increasing `API_SLEEP_TIME` between batches
     - Splitting worker into multiple smaller workers
  3. Redeploy with adjusted config

## 4. Testing Procedures

### 4.1 Test Monitoring Endpoint

**Test 1: Verify endpoint is accessible**
```bash
curl -I https://theride.ie/api/stats/monitoring.json
# Expected: HTTP/2 200, Cache-Control: public, max-age=300
```

**Test 2: Verify response structure**
```bash
curl -s https://theride.ie/api/stats/monitoring.json | jq '.is_healthy'
# Expected: true (if system is healthy)
```

**Test 3: Check data freshness**
```bash
curl -s https://theride.ie/api/stats/monitoring.json | jq '.data_freshness'
# Expected: hours_since_last_data < 25
```

### 4.2 Test UptimeRobot Monitor

1. Go to UptimeRobot dashboard
2. Find "The Ride - Health Check" monitor
3. Click **"Quick Actions"** → **"Check Now"**
4. Verify status shows **"Up"**
5. Check response time is reasonable (<1000ms)

### 4.3 Test Alert Delivery

**Test UptimeRobot Alerts:**
1. In monitor settings, temporarily change keyword to impossible value (e.g., `"test":12345`)
2. Wait for next check (5 minutes) or click "Check Now"
3. Verify alert is sent to configured contacts (email, Slack)
4. Revert keyword to `"is_healthy":true`
5. Verify recovery notification is sent

**Test Cloudflare Worker Alerts:**
1. Manually trigger worker: Cloudflare Dashboard → Workers → update-sensor-data → Triggers → "Send test event"
2. Check Slack/email for any alerts (should be none if worker succeeds)
3. (Optional) To test failure alert:
   - Temporarily add `throw new Error('Test alert');` to worker code
   - Deploy and trigger
   - Verify alert is received
   - Revert and redeploy

### 4.4 Verify Alert Response Playbook

1. Simulate an alert scenario (see Test 4.3)
2. Follow "Alert Response Procedures" section above
3. Verify all steps are clear and actionable
4. Update documentation if any steps are unclear

## 5. Monitoring Checklist

Use this checklist to verify monitoring is properly configured:

### Initial Setup
- [ ] UptimeRobot account created and verified
- [ ] Health check monitor created (https://theride.ie/api/stats/monitoring.json)
- [ ] Keyword monitoring configured (`"is_healthy":true`)
- [ ] Alert contacts added (email, Slack, etc.)
- [ ] Alert thresholds set (2 failed checks = 10 minutes)
- [ ] Cloudflare notification webhooks configured
- [ ] Worker error alerts enabled (update-sensor-data)
- [ ] Worker error alerts enabled (scrape-location-names)
- [ ] Worker timeout alerts enabled (both workers)
- [ ] High error rate alerts enabled (both workers)

### Testing
- [ ] Monitoring endpoint returns 200 OK
- [ ] Monitoring endpoint returns valid JSON with is_healthy field
- [ ] UptimeRobot monitor shows "Up" status
- [ ] Test alert successfully delivered (UptimeRobot)
- [ ] Test alert successfully delivered (Cloudflare)
- [ ] Alert response procedures tested and verified
- [ ] Team members know how to access logs and metrics

### Ongoing Maintenance
- [ ] Review UptimeRobot uptime reports monthly
- [ ] Review Cloudflare Worker metrics weekly
- [ ] Test alert delivery quarterly
- [ ] Update alert contacts when team changes
- [ ] Review and update alert thresholds as needed

## 6. Maintenance and Updates

### Monthly Review

Review the following metrics:
1. UptimeRobot uptime percentage (target: >99.5%)
2. Average response time (target: <500ms)
3. Number of false positives (target: 0)
4. Worker success rate (target: 100%)
5. Alert response time (target: <30 minutes)

### Quarterly Testing

1. Test all alert channels (email, Slack, etc.)
2. Verify worker logs are accessible
3. Update alert contacts if team has changed
4. Review and update this documentation

### When to Update This Guide

Update this guide when:
- Adding new workers
- Changing monitoring endpoint structure
- Adding new alert channels
- Discovering new failure modes
- Changing worker schedules or configurations

## 7. Additional Resources

- **Cloudflare Workers Documentation**: https://developers.cloudflare.com/workers/
- **Cloudflare Notifications**: https://developers.cloudflare.com/fundamentals/notifications/
- **UptimeRobot Documentation**: https://blog.uptimerobot.com/documentation/
- **Telraam API Status**: https://telraam.net/en/support
- **D1 Status**: https://www.cloudflarestatus.com/

## 8. Support Contacts

- **Cloudflare Support**: https://dash.cloudflare.com/?to=/:account/support
- **Telraam Support**: info@telraam.net
- **UptimeRobot Support**: support@uptimerobot.com

---

**Last Updated:** 2026-02-03
**Document Version:** 1.0
