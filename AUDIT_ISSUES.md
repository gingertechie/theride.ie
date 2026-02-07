# Code Audit - Issues & Improvements
**Generated:** 2026-01-31
**Project:** The Ride (theride.ie)

---

## 🚨 CRITICAL - Security Issues (Fix Immediately)

### 1. **API Key Exposed in Version Control**
- **File:** `.claude/settings.local.json:22`
- **Issue:** TELRAAM_API_KEY hardcoded in permissions config
- **Value:** `jIyO0zZ1Yd9cFn6s5RlIM9qhAQbUG7AK8pH0bhRj`
- **Risk:** Anyone with repo access can use/abuse the Telraam API key
- **Fix:**
  - Immediately rotate the API key at Telraam
  - Remove from `.claude/settings.local.json`
  - Add `.claude/settings.local.json` to `.gitignore`
  - Use environment variables only
  - Review git history to purge the key

### 2. **No Authentication on Write Endpoints**
- **Files:**
  - `src/pages/api/sensors/[id].json.ts` (PUT, DELETE)
  - `src/pages/api/sensors/search.json.ts` (POST)
- **Issue:** Anyone can create, update, or delete sensors via API
- **Risk:** Data corruption, DoS, malicious data injection
- **Fix:** Add authentication middleware (Cloudflare Access [preferred], or API keys)

### 3. **SQL Injection Risk in Backfill Script**
- **File:** `scripts/backfill-sensor-data.ts:289-295`
- **Issue:** Manual SQL parameter replacement with string escaping
- **Code:**
  ```typescript
  const value = param === null ? 'NULL' :
                typeof param === 'number' ? param.toString() :
                `'${param.toString().replace(/'/g, "''")}'`;
  formattedSql = formattedSql.replace('?', value);
  ```
- **Risk:** Potential SQL injection if Telraam API returns malicious data
- **Fix:** Use D1's prepared statements properly or a safer SQL builder

### 4. **Unvalidated Limit Parameter (DoS Risk)**
- **File:** `src/pages/api/stats/counties.json.ts:34-35`
- **Issue:** No max limit validation on `?limit` query param
- **Risk:** Users can request `?limit=999999999` causing database overload
- **Fix:** Enforce maximum limit (e.g., 100) and validate input

---

## ⚠️ HIGH PRIORITY - Security & Data Integrity

### 5. **Missing Input Validation**
- **Files:** Multiple API endpoints
- **Issues:**
  - `counties.json.ts`: Integer overflow not checked for `limit`
  - `search.json.ts`: Bounding box coordinates not validated for sanity
  - `[id].json.ts`: PUT accepts arbitrary sensor data without schema validation
- **Fix:** Add Zod schemas for all API inputs and validate before database operations

### 6. **Schema Mismatch - Orphaned Columns**
- **File:** `db/schema.sql:8-16`
- **Issue:** `sensor_locations` table contains traffic data columns (`bike`, `car`, `heavy`, etc.) that are no longer used. Data is stored in `sensor_hourly_data` table instead.
- **Impact:** Wasted storage, confusion, potential bugs if code accidentally uses old columns
- **Fix:** Create migration to drop unused columns: `date`, `period`, `uptime`, `heavy`, `car`, `bike`, `pedestrian`, `night`, `v85`

### 7. **Missing Indexes on Hourly Data Table**
- **File:** `db/migrations/0004_create_hourly_data_table.sql` (missing indexes)
- **Issue:** No indexes on `sensor_hourly_data` despite frequent queries on:
  - `hour_timestamp` (range queries in all stats functions)
  - `segment_id, hour_timestamp` composite (already has UNIQUE constraint, but explicit index recommended)
- **Impact:** Slow queries as data grows
- **Fix:** Add indexes:
  ```sql
  CREATE INDEX idx_hourly_timestamp ON sensor_hourly_data(hour_timestamp);
  CREATE INDEX idx_hourly_segment_time ON sensor_hourly_data(segment_id, hour_timestamp);
  ```

### 8. **Error Messages Expose Debug Info in Production**
- **Files:** All API endpoints
- **Issue:** `debug` objects in error responses expose internal structure
- **Example:** `src/pages/api/stats/national.json.ts:16-20`
- **Risk:** Information leakage helps attackers understand system architecture
- **Fix:** Only include debug info in development mode, not production

### 9. **Incorrect Site URL Configuration**
- **File:** `astro.config.mjs:12`
- **Issue:** `site: "https://positivustheme.vercel.app"` - old Vercel URL
- **Impact:** SEO, sitemap, canonical URLs all broken
- **Fix:** Update to actual production URL: `https://theride.ie`

---

## 🔶 MEDIUM PRIORITY - Performance & Architecture

### 10. **No Caching Strategy**
- **Files:** Most API endpoints
- **Issue:** No `Cache-Control` headers except on monitoring endpoint
- **Impact:** Every request hits database, slow page loads, high database load
- **Fix:** Add appropriate caching:
  - National stats: 5-minute cache
  - County stats: 5-minute cache
  - Sensor data: 10-minute cache
  - Static sensor list: 1-hour cache

### 11. **Missing CORS Configuration**
- **Files:** All API endpoints
- **Issue:** No CORS headers configured
- **Impact:** Cannot use API from external domains/apps
- **Fix:** Add CORS headers in Cloudflare adapter or middleware

### 12. **No Rate Limiting**
- **Files:** All API endpoints and workers
- **Issue:** No protection against abuse or accidental DoS
- **Impact:** Malicious or buggy clients can overwhelm server
- **Fix:** Implement Cloudflare rate limiting rules or use `@cloudflare/workers-rate-limit`

### 13. **Worker Failure Detection is Passive**
- **File:** Worker logs are only checked manually
- **Issue:** No alerts if workers fail to run or error out
- **Impact:** Data can become stale for days without detection
- **Fix:**
  - Set up Cloudflare Worker alerts for failures
  - Use monitoring endpoint (`/api/stats/monitoring.json`) with external healthcheck service (UptimeRobot, Better Uptime, etc.)
  - Alert if `is_healthy: false` or `worker_likely_ran: false`

### 14. **Duplicate Date Formatting Logic**
- **Files:**
  - `src/utils/db.ts:19-24, 318-326, 427-442`
  - `workers/update-sensor-data/index.ts:371-380`
  - `scripts/backfill-sensor-data.ts:318-327`
- **Issue:** Same date formatting function duplicated 5+ times
- **Impact:** Maintenance burden, potential bugs from inconsistencies
- **Fix:** Extract to shared utility module

### 15. **Hardcoded Configuration Values**
- **Files:** Multiple
- **Issues:**
  - Worker batch size: `SENSORS_PER_BATCH = 15` (update-sensor-data/index.ts:20)
  - API sleep time: `5000ms` (update-sensor-data/index.ts:144)
  - Cleanup retention: `7 days` (update-sensor-data/index.ts:354-356)
  - Database IDs duplicated in 3 wrangler.toml files
  - Scraper rate limit: `3000ms` (scrape-location-names/index.ts:44)
- **Fix:** Move to environment variables or config file

### 16. **No Retry Logic for External API Calls**
- **Files:**
  - `workers/update-sensor-data/index.ts:222-238`
  - `workers/scrape-location-names/index.ts:88-99`
- **Issue:** Single fetch to Telraam API with no retries on failure
- **Impact:** Temporary network issues cause data loss
- **Fix:** Add exponential backoff retry logic (3-5 attempts)

### 17. **Feature Flag via URL Parameter**
- **File:** `src/pages/index.astro:8-9`
- **Issue:** `?showBusiestSensor=true` controls feature visibility
- **Security:** Insecure, users can discover hidden features
- **Fix:** Use environment variables or Cloudflare feature flags

### 18. **Database Migration Versioning**
- **Files:** `db/migrations/` directory
- **Issue:** No automated migration runner or version tracking
- **Risk:** Forgetting to run migrations on production, running them out of order
- **Fix:** Implement migration version tracking table and automated runner

---

## 🔹 LOW PRIORITY - Code Quality & Maintainability

### 19. **No Tests**
- **Issue:** Zero unit tests, integration tests, or E2E tests
- **Impact:** Refactoring is risky, bugs hard to catch early
- **Fix:** Add Vitest for unit tests, Playwright for E2E tests

### 20. **Inconsistent Error Handling**
- **Files:** API endpoints
- **Issue:** Some return 404, some return 500 for same scenario (no data found)
- **Example:** Compare `national.json.ts:34-46` vs `busiest-sensor.json.ts:29-42`
- **Fix:** Standardize error response format and status codes

### 21. **Magic Numbers**
- **Files:** Multiple
- **Examples:**
  - `0.7` threshold (db.ts:504)
  - `50` batch size (update-sensor-data/index.ts:251)
  - `30000` timeout (scrape-location-names/index.ts:89)
- **Fix:** Extract to named constants with comments explaining rationale

### 22. **Weak HTML Parsing in Scraper**
- **File:** `workers/scrape-location-names/index.ts:104`
- **Code:** `/<h1>(.*?)<\/h1>/`
- **Issue:** Vulnerable to malformed HTML, nested tags, attributes
- **Fix:** Use proper HTML parser library or make regex more robust

### 23. **Missing JSDoc Comments**
- **Files:** Some utility functions lack documentation
- **Impact:** Harder for new developers to understand code
- **Fix:** Add JSDoc to all exported functions

### 24. **Unused TypeScript Config**
- **File:** `tsconfig.json:8`
- **Issue:** `"jsx": "react-jsx"` but no React components in project
- **Fix:** Remove if not needed, or document if planned for future

### 25. **Legacy Tailwind Colors**
- **File:** `tailwind.config.mjs:34-39`
- **Issue:** "Legacy compatibility" colors defined but unclear if used
- **Fix:** Audit codebase, remove if unused

### 26. **No Structured Logging**
- **Files:** Workers use `console.log` with varying formats
- **Impact:** Hard to parse logs programmatically
- **Fix:** Implement structured JSON logging

### 27. **Missing SEO Essentials**
- **Issue:** No `robots.txt`, `sitemap.xml`, or `humans.txt`
- **Impact:** Search engines can't index site efficiently
- **Fix:** Generate sitemap from routes, add robots.txt

### 28. **No Compression Middleware**
- **Issue:** No explicit gzip/brotli compression configured
- **Impact:** Larger response sizes, slower page loads
- **Fix:** Configure Cloudflare compression or add middleware

### 29. **Hardcoded External URLs**
- **Files:** County pages, components
- **Example:** `https://telraam.net/en/location/${segment_id}`
- **Impact:** If Telraam changes URL structure, many files need updates
- **Fix:** Centralize URL building in utility function

### 30. **No Request ID Tracking**
- **Issue:** Cannot correlate logs across distributed system
- **Impact:** Debugging issues across API → DB → Worker is difficult
- **Fix:** Add request ID header and propagate through all logs

### 31. **D1 Database Type Definitions**
- **File:** `src/env.d.ts:14-44`
- **Issue:** Manual D1 type definitions when `@cloudflare/workers-types` provides them
- **Fix:** Use official types package instead of custom definitions

### 32. **Worker Timeout Protection**
- **Files:** Both workers
- **Issue:** Long-running operations (fetching 73 sensors) could hit worker timeout limits
- **Fix:**
  - Track execution time and gracefully exit before timeout
  - Persist progress to resume from failure point
  - Add alerts if worker approaches timeout

### 33. **No Dependency Vulnerability Scanning**
- **Issue:** No automated security scanning in CI/CD
- **Risk:** Using packages with known vulnerabilities
- **Fix:** Add Dependabot, Snyk, or npm audit to CI/CD pipeline

### 34. **Inconsistent Null Handling**
- **Files:** Database utility functions
- **Issue:** Some functions use `|| []`, others use `?? []`, inconsistent null checks
- **Fix:** Standardize on nullish coalescing (`??`) throughout

### 35. **Temporary File Cleanup in Backfill**
- **File:** `scripts/backfill-sensor-data.ts:308`
- **Issue:** Silent failure in cleanup: `await fs.unlink(tempFile).catch(() => {})`
- **Impact:** Can accumulate temp files if cleanup fails repeatedly
- **Fix:** Log cleanup failures for monitoring

---

## 📊 Architecture Improvements

### 36. **No Database Connection Pooling**
- **Issue:** Each API request creates new D1 connection
- **Impact:** Connection overhead on high traffic
- **Note:** D1 handles this automatically at edge, but verify if connection reuse is optimal

### 37. **Telraam API Response Validation**
- **Files:** Workers processing Telraam data
- **Issue:** Minimal validation of API response structure before database insert
- **Risk:** Malformed API responses could corrupt database
- **Fix:** Add Zod schema validation for Telraam API responses

### 38. **No API Versioning**
- **Issue:** API routes have no version prefix (e.g., `/api/v1/stats`)
- **Impact:** Breaking changes require new domain or complex migrations
- **Fix:** Version API endpoints for future-proofing

### 39. **Sensor Status Tracking**
- **Issue:** No way to mark sensors as inactive/offline
- **Impact:** Stats include sensors that are broken or removed
- **Fix:** Add `status` column to `sensor_locations` (active/inactive/retired)

### 40. **Data Retention Policy**
- **Issue:** Worker deletes data older than 7 days, but no documentation or configuration
- **Impact:** Arbitrary data loss, no historical analysis possible
- **Fix:**
  - Document retention policy
  - Make configurable
  - Consider archiving to R2 instead of deleting

---

## ✅ Recommendations Summary

### Immediate Actions (This Week)
1. **Rotate Telraam API key** and remove from `.claude/settings.local.json`
2. **Add authentication** to write endpoints (PUT/DELETE/POST)
3. **Fix SQL injection risk** in backfill script
4. **Add max limit validation** to counties endpoint
5. **Update site URL** in `astro.config.mjs`

### Short-term (This Month)
6. Add input validation with Zod schemas
7. Implement rate limiting
8. Add database indexes on `sensor_hourly_data`
9. Set up monitoring alerts for worker failures
10. Add caching headers to API responses

### Long-term (This Quarter)
11. Write comprehensive test suite
12. Implement structured logging
13. Set up CI/CD with security scanning
14. Add API versioning
15. Create database migration automation
16. Implement data archival strategy

---

## 📝 Notes

- **Good practices observed:**
  - Using prepared statements in db.ts (prevents SQL injection)
  - Consistent error handling structure in API routes
  - Separation of concerns (db utils, API routes, workers)
  - Recent fix of SQL injection in busiest-hour endpoint (commit 4667523)

- **Missing from codebase:**
  - CONTRIBUTING.md
  - API documentation (OpenAPI/Swagger)
  - Development setup guide
  - Production deployment checklist
  - Incident response runbook

---

**End of Audit Report**
