# Security Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Systematically address security vulnerabilities in The Ride codebase, prioritizing critical issues that could lead to data breaches, data corruption, or service disruption.

**Architecture:** This plan focuses on defense-in-depth: adding authentication layers, input validation, rate limiting, and secure configuration management. Leverages Cloudflare's edge security features while adding application-layer protections.

**Tech Stack:**
- Cloudflare D1 (SQLite edge database)
- Astro 5.x SSR with Cloudflare adapter
- Cloudflare Workers for scheduled tasks
- Zod for schema validation
- Environment variables for secrets management

**Context:** Based on comprehensive audit documented in `AUDIT_ISSUES.md`. The audit identified 40 issues across critical, high, medium, and low priority categories. This plan addresses the 15 most critical security issues that pose immediate risk.

---

## Phase 1: Critical Security Issues (Week 1)

### Task 1: Secure API Key Management

**Risk Level:** CRITICAL - API key exposed in version control (Issue #1)

**Files:**
- Review: `.claude/settings.local.json` (contains exposed key)
- Modify: `.gitignore`
- Create: `docs/SECURITY.md` (incident response documentation)

**Step 1: Verify current key exposure**

Review the exposed key location:
```bash
git log --all --full-history -- "*settings.local.json" | head -20
```

Expected: Shows commit history where key was committed

**Step 2: Rotate the Telraam API key**

Action required (manual - cannot be automated):
1. Log into Telraam API portal
2. Generate new API key
3. Add to Cloudflare Workers secrets:
   ```bash
   wrangler secret put TELRAAM_API_KEY
   # Paste new key when prompted
   ```
4. Add to Cloudflare environment variables for main site

**Step 3: Add sensitive files to .gitignore**

```bash
cat >> .gitignore << 'EOF'

# Claude Code local settings (may contain secrets)
.claude/settings.local.json
.claude/*.local.*

# Environment files
.env
.env.local
.env.*.local
EOF
```

**Step 4: Remove exposed key from file**

```bash
# Back up current settings
cp .claude/settings.local.json .claude/settings.local.json.backup

# Remove the exposed key from the file (manual edit required)
# Replace with reference to environment variable
```

**Step 5: Document incident and prevention**

Create `docs/SECURITY.md`:
```markdown
# Security Guidelines

## Secrets Management

### DO:
- Store all secrets in Cloudflare environment variables
- Use `wrangler secret put` for Worker secrets
- Reference secrets via `env.SECRET_NAME` in code

### DON'T:
- Commit API keys, passwords, or tokens
- Store secrets in `.claude/settings.local.json`
- Hardcode credentials in source files

## Incident Response

### API Key Rotation Checklist:
1. Generate new key at provider
2. Update Cloudflare secrets immediately
3. Verify worker runs successfully
4. Revoke old key at provider
5. Document in git commit
```

**Step 6: Commit changes**

```bash
git add .gitignore docs/SECURITY.md
git commit -m "security: add sensitive files to gitignore and document secrets management

- Add .claude/settings.local.json to gitignore
- Create SECURITY.md with secrets management guidelines
- Document API key rotation procedure

Addresses: AUDIT_ISSUES.md #1

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 7: Purge key from git history (if needed)**

Note: This requires force-push. Coordinate with team first.

```bash
# Use git-filter-repo or BFG Repo-Cleaner
# NOT AUTOMATED - requires careful manual execution
```

---

### Task 2: Add Authentication to Write Endpoints

**Risk Level:** CRITICAL - Unauthenticated write access (Issue #2)

**Files:**
- Create: `src/middleware/auth.ts` (authentication middleware)
- Modify: `src/pages/api/sensors/[id].json.ts:77-130` (PUT handler)
- Modify: `src/pages/api/sensors/[id].json.ts:136-184` (DELETE handler)
- Modify: `src/pages/api/sensors/search.json.ts` (POST handler)
- Modify: `wrangler.toml` (add admin API key binding)

**Step 1: Create authentication utility**

Create `src/utils/auth.ts`:
```typescript
/**
 * Authentication utilities for API endpoints
 * Uses simple API key authentication for administrative operations
 */

/**
 * Verify API key from request headers
 * Expects: Authorization: Bearer <api-key>
 */
export function verifyAdminAuth(request: Request, env: any): { authorized: boolean; error?: string } {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return {
      authorized: false,
      error: 'Missing Authorization header',
    };
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer') {
    return {
      authorized: false,
      error: 'Invalid authorization scheme. Use: Bearer <token>',
    };
  }

  if (!token) {
    return {
      authorized: false,
      error: 'Missing authorization token',
    };
  }

  // Compare with admin API key from environment
  const adminKey = env.ADMIN_API_KEY;

  if (!adminKey) {
    console.error('ADMIN_API_KEY not configured in environment');
    return {
      authorized: false,
      error: 'Server configuration error',
    };
  }

  // Constant-time comparison to prevent timing attacks
  if (token.length !== adminKey.length) {
    return {
      authorized: false,
      error: 'Invalid credentials',
    };
  }

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ adminKey.charCodeAt(i);
  }

  if (mismatch !== 0) {
    return {
      authorized: false,
      error: 'Invalid credentials',
    };
  }

  return { authorized: true };
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(error: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error,
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="admin"',
      },
    }
  );
}
```

**Step 2: Run test to verify auth utility compiles**

```bash
npm run build 2>&1 | grep -A5 "auth.ts"
```

Expected: No TypeScript errors in auth.ts

**Step 3: Add authentication to PUT endpoint**

Modify `src/pages/api/sensors/[id].json.ts` PUT handler:

```typescript
// Add import at top
import { verifyAdminAuth, unauthorizedResponse } from '@/utils/auth';

// In PUT handler, add auth check before line 79
export const PUT: APIRoute = async ({ locals, params, request }) => {
  // Verify authentication
  const authResult = verifyAdminAuth(request, locals.runtime.env);
  if (!authResult.authorized) {
    return unauthorizedResponse(authResult.error!);
  }

  try {
    const segmentId = parseInt(params.id || '');
    // ... rest of existing code
```

**Step 4: Add authentication to DELETE endpoint**

Modify `src/pages/api/sensors/[id].json.ts` DELETE handler (similar pattern):

```typescript
export const DELETE: APIRoute = async ({ locals, params, request }) => {
  // Verify authentication
  const authResult = verifyAdminAuth(request, locals.runtime.env);
  if (!authResult.authorized) {
    return unauthorizedResponse(authResult.error!);
  }

  try {
    const segmentId = parseInt(params.id || '');
    // ... rest of existing code
```

**Step 5: Run build to verify changes compile**

```bash
npm run build
```

Expected: Build succeeds with no errors

**Step 6: Generate admin API key**

```bash
# Generate a secure random key
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Expected: Outputs a 43-character base64url string

**Step 7: Add admin key to Cloudflare**

```bash
# For production site
wrangler secret put ADMIN_API_KEY
# Paste the generated key when prompted

# For workers (if they need admin access)
cd workers/update-sensor-data
wrangler secret put ADMIN_API_KEY -c wrangler.toml
cd ../..
```

**Step 8: Test authentication locally**

```bash
# Start dev server with bindings
npm run dev:wrangler &
DEV_PID=$!

# Wait for server to start
sleep 5

# Test unauthorized request (should fail)
curl -X PUT http://localhost:4321/api/sensors/9000000001.json \
  -H "Content-Type: application/json" \
  -d '{"segment_id":9000000001,"timezone":"Europe/Dublin"}' \
  | jq .

# Test authorized request (should succeed - use actual key from previous step)
curl -X PUT http://localhost:4321/api/sensors/9000000001.json \
  -H "Authorization: Bearer YOUR_GENERATED_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"segment_id":9000000001,"timezone":"Europe/Dublin"}' \
  | jq .

# Cleanup
kill $DEV_PID
```

Expected: First request returns 401, second returns 200

**Step 9: Commit authentication implementation**

```bash
git add src/utils/auth.ts src/pages/api/sensors/\[id\].json.ts
git commit -m "security: add API key authentication to write endpoints

- Create auth utility with Bearer token verification
- Add constant-time comparison to prevent timing attacks
- Protect PUT and DELETE endpoints with admin authentication
- Require Authorization header for all write operations

Addresses: AUDIT_ISSUES.md #2

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Add Input Validation with Zod

**Risk Level:** HIGH - Unvalidated limit parameter DoS risk (Issue #4) and general input validation (Issue #5)

**Files:**
- Create: `src/schemas/api.ts` (Zod validation schemas)
- Modify: `src/pages/api/stats/counties.json.ts:34-35`
- Modify: `src/pages/api/sensors/search.json.ts`
- Modify: `src/pages/api/sensors/[id].json.ts:97`

**Step 1: Install Zod**

```bash
npm install zod
```

Expected: Zod added to package.json

**Step 2: Create API validation schemas**

Create `src/schemas/api.ts`:
```typescript
import { z } from 'zod';

/**
 * Validation schemas for API inputs
 */

// Query parameter schemas
export const CountiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(3),
});

export const SearchBoundsSchema = z.object({
  minLat: z.coerce.number().min(-90).max(90),
  maxLat: z.coerce.number().min(-90).max(90),
  minLon: z.coerce.number().min(-180).max(180),
  maxLon: z.coerce.number().min(-180).max(180),
});

// Sensor data schema
export const SensorLocationSchema = z.object({
  segment_id: z.number().int().positive(),
  last_data_package: z.string().optional(),
  timezone: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  country: z.string().max(100).optional(),
  county: z.string().max(100).optional(),
  city_town: z.string().max(200).optional(),
  locality: z.string().max(200).optional(),
  eircode: z.string().max(20).optional(),
});

/**
 * Validation helper
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return {
        success: false,
        error: `Validation failed: ${messages.join(', ')}`,
      };
    }
    return {
      success: false,
      error: 'Validation failed',
    };
  }
}
```

**Step 3: Run build to verify schemas compile**

```bash
npm run build 2>&1 | grep -A5 "schemas/api"
```

Expected: No TypeScript errors

**Step 4: Add validation to counties endpoint**

Modify `src/pages/api/stats/counties.json.ts`:

```typescript
// Add import at top
import { CountiesQuerySchema, validateInput } from '@/schemas/api';

// Replace lines 34-35 with validation
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    // ... existing DB check code ...

    // Validate and parse limit parameter
    const validation = validateInput(CountiesQuerySchema, {
      limit: url.searchParams.get('limit') || '3',
    });

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: validation.error,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { limit } = validation.data;

    const counties = await getTopCountiesByBikes(db, limit);
    // ... rest of existing code ...
```

**Step 5: Add validation to sensor PUT endpoint**

Modify `src/pages/api/sensors/[id].json.ts`:

```typescript
// Add import at top
import { SensorLocationSchema, validateInput } from '@/schemas/api';

// In PUT handler, replace line 97 with validation
export const PUT: APIRoute = async ({ locals, params, request }) => {
  // ... existing auth check ...

  try {
    const segmentId = parseInt(params.id || '');

    if (isNaN(segmentId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid segment ID',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const db = locals.runtime.env.DB as D1Database;
    const rawData = await request.json();

    // Validate sensor data
    const validation = validateInput(SensorLocationSchema, {
      ...rawData,
      segment_id: segmentId, // Ensure ID matches URL
    });

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: validation.error,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    await upsertSensor(db, validation.data);
    // ... rest of existing code ...
```

**Step 6: Run build and verify**

```bash
npm run build
```

Expected: Build succeeds

**Step 7: Test validation**

```bash
# Start dev server
npm run dev:wrangler &
DEV_PID=$!
sleep 5

# Test invalid limit (too large)
curl "http://localhost:4321/api/stats/counties.json?limit=999" | jq .

# Test invalid limit (negative)
curl "http://localhost:4321/api/stats/counties.json?limit=-5" | jq .

# Test valid limit
curl "http://localhost:4321/api/stats/counties.json?limit=5" | jq .

# Cleanup
kill $DEV_PID
```

Expected: First two return 400 with validation errors, third returns 200

**Step 8: Commit validation implementation**

```bash
git add src/schemas/api.ts src/pages/api/stats/counties.json.ts src/pages/api/sensors/\[id\].json.ts package.json package-lock.json
git commit -m "security: add input validation with Zod schemas

- Install Zod for schema validation
- Create validation schemas for API inputs
- Add max limit (100) to counties endpoint (DoS protection)
- Validate geographic bounds to prevent invalid queries
- Validate sensor data structure and types
- Return 400 with detailed errors for invalid inputs

Addresses: AUDIT_ISSUES.md #4, #5

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Fix Incorrect Site URL

**Risk Level:** HIGH - SEO and canonical URL issues (Issue #9)

**Files:**
- Modify: `astro.config.mjs:12`

**Step 1: Read current configuration**

```bash
cat astro.config.mjs
```

Expected: Shows `site: "https://positivustheme.vercel.app"`

**Step 2: Verify actual production domain**

Manual check required: Confirm the actual production domain is `theride.ie`

**Step 3: Update site URL**

Modify `astro.config.mjs` line 12:

```diff
- site: "https://positivustheme.vercel.app",
+ site: "https://theride.ie",
```

**Step 4: Run build to verify**

```bash
npm run build
```

Expected: Build succeeds

**Step 5: Verify sitemap generation (if enabled)**

```bash
find dist -name "sitemap*" -o -name "robots.txt"
```

Expected: If sitemap exists, should reference theride.ie domain

**Step 6: Commit configuration fix**

```bash
git add astro.config.mjs
git commit -m "fix: update site URL from Vercel placeholder to production domain

- Change site URL from positivustheme.vercel.app to theride.ie
- Fixes SEO canonical URLs and sitemap generation
- Ensures proper Open Graph metadata

Addresses: AUDIT_ISSUES.md #9

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: High Priority Security (Week 2)

### Task 5: Add Database Indexes for Performance

**Risk Level:** HIGH - Slow queries as data grows (Issue #7)

**Files:**
- Create: `db/migrations/0005_add_hourly_data_indexes.sql`

**Step 1: Create migration for indexes**

Create `db/migrations/0005_add_hourly_data_indexes.sql`:
```sql
-- Migration: Add indexes to sensor_hourly_data for query performance
-- Created: 2026-02-03
-- Purpose: Optimize range queries on hour_timestamp and composite queries

-- Index for timestamp range queries (used in all stats functions)
CREATE INDEX IF NOT EXISTS idx_hourly_timestamp
ON sensor_hourly_data(hour_timestamp);

-- Composite index for sensor-specific queries
-- Note: UNIQUE constraint already exists on (segment_id, hour_timestamp)
-- but we add explicit index for query optimization
CREATE INDEX IF NOT EXISTS idx_hourly_segment_time
ON sensor_hourly_data(segment_id, hour_timestamp);

-- Index for cleanup queries (deleting old data)
CREATE INDEX IF NOT EXISTS idx_hourly_cleanup
ON sensor_hourly_data(hour_timestamp)
WHERE hour_timestamp < datetime('now', '-7 days');
```

**Step 2: Test migration locally**

```bash
# Run migration on local D1 database
npx wrangler d1 execute theride-db --local --file=./db/migrations/0005_add_hourly_data_indexes.sql
```

Expected: "Success" message

**Step 3: Verify indexes created**

```bash
# Check indexes on local database
npx wrangler d1 execute theride-db --local --command "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='sensor_hourly_data';"
```

Expected: Shows the 3 new indexes

**Step 4: Run migration on production**

```bash
# Run migration on production D1 database
npx wrangler d1 execute theride-db --file=./db/migrations/0005_add_hourly_data_indexes.sql
```

Expected: "Success" message

**Step 5: Commit migration**

```bash
git add db/migrations/0005_add_hourly_data_indexes.sql
git commit -m "perf: add database indexes to sensor_hourly_data table

- Add index on hour_timestamp for range queries
- Add composite index on (segment_id, hour_timestamp)
- Add partial index for cleanup operations
- Improves query performance as dataset grows

Addresses: AUDIT_ISSUES.md #7

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 6: Remove Debug Info from Production Errors

**Risk Level:** HIGH - Information disclosure (Issue #8)

**Files:**
- Create: `src/utils/errors.ts` (error handling utilities)
- Modify: `src/pages/api/stats/national.json.ts`
- Modify: `src/pages/api/stats/counties.json.ts`
- Modify: All other API endpoints

**Step 1: Create error handling utility**

Create `src/utils/errors.ts`:
```typescript
/**
 * Error handling utilities for API endpoints
 * Prevents information disclosure in production
 */

/**
 * Determine if we're in development mode
 */
export function isDevelopment(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
}

/**
 * Create a safe error response that hides internal details in production
 */
export function errorResponse(
  error: unknown,
  userMessage: string = 'An error occurred',
  statusCode: number = 500
): Response {
  const isDev = isDevelopment();

  // In development, include full error details for debugging
  if (isDev) {
    return new Response(
      JSON.stringify({
        success: false,
        error: userMessage,
        debug: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      }),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // In production, return only the user-facing message
  // Log the full error server-side
  console.error('API Error:', error);

  return new Response(
    JSON.stringify({
      success: false,
      error: userMessage,
    }),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Create a database unavailable error response
 */
export function databaseUnavailableResponse(): Response {
  const isDev = isDevelopment();

  if (isDev) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Database not available',
        debug: {
          message: 'D1 database binding not configured. Run with npm run dev:wrangler',
        },
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: 'Service temporarily unavailable',
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
```

**Step 2: Update national.json.ts to use error utility**

Modify `src/pages/api/stats/national.json.ts`:

```typescript
// Add import at top
import { errorResponse, databaseUnavailableResponse } from '@/utils/errors';

// Replace database check error (around line 11-28)
if (!locals.runtime?.env?.DB) {
  return databaseUnavailableResponse();
}

// Replace catch block at end
} catch (error) {
  return errorResponse(error, 'Failed to retrieve national statistics');
}
```

**Step 3: Update counties.json.ts**

Similar pattern - replace debug objects with error utility calls.

**Step 4: Run build to verify**

```bash
npm run build
```

Expected: Build succeeds

**Step 5: Test error responses**

```bash
# Start dev server
npm run dev:wrangler &
DEV_PID=$!
sleep 5

# Test that dev mode shows debug info
curl "http://localhost:4321/api/stats/counties.json?limit=invalid" | jq .

# Cleanup
kill $DEV_PID

# Production build will hide debug info (verify after deployment)
```

Expected: Dev mode shows debug object, production will not

**Step 6: Commit error handling improvements**

```bash
git add src/utils/errors.ts src/pages/api/stats/national.json.ts src/pages/api/stats/counties.json.ts
git commit -m "security: hide internal error details in production

- Create error handling utility with dev/prod modes
- Show debug info only in development
- Hide stack traces and internal structure in production
- Log errors server-side for monitoring
- Provide user-friendly messages

Addresses: AUDIT_ISSUES.md #8

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 7: Add Cache-Control Headers

**Risk Level:** MEDIUM - Performance and database load (Issue #10)

**Files:**
- Modify: `src/pages/api/stats/national.json.ts`
- Modify: `src/pages/api/stats/counties.json.ts`
- Modify: `src/pages/api/stats/county/[county].json.ts`
- Modify: `src/pages/api/sensors.json.ts`

**Step 1: Add caching to national stats**

Modify `src/pages/api/stats/national.json.ts` success response:

```typescript
return new Response(
  JSON.stringify({
    success: true,
    data: stats,
  }),
  {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minutes
    },
  }
);
```

**Step 2: Add caching to counties stats**

Modify `src/pages/api/stats/counties.json.ts` success response:

```typescript
return new Response(
  JSON.stringify({
    success: true,
    data: counties,
  }),
  {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minutes
    },
  }
);
```

**Step 3: Add caching to county details**

Modify `src/pages/api/stats/county/[county].json.ts` success response:

```typescript
'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minutes
```

**Step 4: Add caching to sensors list**

Modify `src/pages/api/sensors.json.ts` success response:

```typescript
'Cache-Control': 'public, max-age=3600, s-maxage=3600', // 1 hour (rarely changes)
```

**Step 5: Test cache headers**

```bash
# Start dev server
npm run dev:wrangler &
DEV_PID=$!
sleep 5

# Check cache headers
curl -I "http://localhost:4321/api/stats/national.json"

# Cleanup
kill $DEV_PID
```

Expected: Response includes `Cache-Control: public, max-age=300`

**Step 6: Commit caching implementation**

```bash
git add src/pages/api/stats/*.ts src/pages/api/sensors.json.ts
git commit -m "perf: add Cache-Control headers to API endpoints

- National stats: 5-minute cache
- County stats: 5-minute cache
- County details: 5-minute cache
- Sensors list: 1-hour cache
- Reduces database load and improves response times

Addresses: AUDIT_ISSUES.md #10

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Medium Priority (Week 3)

### Task 8: Implement Rate Limiting

**Risk Level:** MEDIUM - DoS protection (Issue #12)

**Files:**
- Create: `src/middleware/ratelimit.ts`
- Modify: `src/pages/api/sensors/[id].json.ts` (apply to write endpoints)
- Document: `docs/SECURITY.md`

**Implementation Note:** Cloudflare provides built-in rate limiting at the edge. This task documents configuration via Cloudflare dashboard rather than code.

**Step 1: Document rate limiting strategy**

Update `docs/SECURITY.md`:

```markdown
## Rate Limiting

### Cloudflare Dashboard Configuration

The Ride uses Cloudflare's built-in rate limiting to prevent abuse:

#### Read Endpoints (GET)
- **Rule:** 100 requests per minute per IP
- **Scope:** `/api/*`
- **Action:** Return 429 Too Many Requests
- **Duration:** 1 minute block

#### Write Endpoints (PUT/DELETE/POST)
- **Rule:** 10 requests per minute per IP
- **Scope:** `/api/sensors/*` (write methods only)
- **Action:** Return 429 Too Many Requests
- **Duration:** 5 minute block

### Configuration Steps

1. Log into Cloudflare dashboard
2. Navigate to: Security > WAF > Rate limiting rules
3. Create rule: "API Read Rate Limit"
   - If: `http.request.uri.path matches "^/api/"` AND `http.request.method eq "GET"`
   - Then: Rate limit 100 req/min per IP
4. Create rule: "API Write Rate Limit"
   - If: `http.request.uri.path matches "^/api/sensors/"` AND `http.request.method in {"PUT","DELETE","POST"}`
   - Then: Rate limit 10 req/min per IP

### Testing Rate Limits

```bash
# Test read rate limit (should block after 100 requests)
for i in {1..110}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://theride.ie/api/stats/national.json"
  sleep 0.1
done

# Test write rate limit (should block after 10 requests)
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X DELETE \
    -H "Authorization: Bearer $ADMIN_API_KEY" \
    "https://theride.ie/api/sensors/test-$i.json"
  sleep 0.1
done
```
```

**Step 2: Commit rate limiting documentation**

```bash
git add docs/SECURITY.md
git commit -m "docs: add rate limiting configuration guide

- Document Cloudflare rate limiting strategy
- Separate limits for read (100/min) and write (10/min) operations
- Include testing procedures
- Provide dashboard configuration steps

Addresses: AUDIT_ISSUES.md #12

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 3: Configure in Cloudflare (manual)**

Action required (cannot be automated):
1. Log into Cloudflare dashboard for theride.ie
2. Follow configuration steps documented above
3. Test rate limits with provided scripts
4. Monitor logs for rate limit events

---

### Task 9: Add Worker Monitoring Alerts

**Risk Level:** MEDIUM - Operational reliability (Issue #13)

**Files:**
- Document: `docs/MONITORING.md`

**Implementation Note:** This task documents external monitoring setup rather than code changes.

**Step 1: Create monitoring documentation**

Create `docs/MONITORING.md`:

```markdown
# Monitoring and Alerting

## External Health Check Setup

The Ride provides a monitoring endpoint for external health check services:

**Endpoint:** `https://theride.ie/api/stats/monitoring.json`

**Response Format:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-03T10:30:00Z",
    "comparison": {
      "is_healthy": true,
      "threshold": 0.7
    },
    "diagnostic": {
      "worker_likely_ran": true,
      "data_freshness_hours": 2.5
    }
  }
}
```

## Recommended Monitoring Service

**UptimeRobot** (free tier available):
- Website: https://uptimerobot.com
- Frequency: Every 5 minutes
- Check type: Keyword monitor
- Alert keyword: `"is_healthy":true`
- Alert if: Keyword NOT found

## Setup Steps

### 1. Create Monitor

1. Sign up at UptimeRobot
2. Add New Monitor:
   - Monitor Type: HTTP(s)
   - Friendly Name: "The Ride - Data Health"
   - URL: `https://theride.ie/api/stats/monitoring.json`
   - Monitoring Interval: 5 minutes

### 2. Configure Keyword Alert

1. Add Keyword:
   - Type: Keyword not exists
   - Keyword: `"is_healthy":true`
   - This alerts if the API returns `"is_healthy":false`

### 3. Add Alert Contacts

1. Navigate to: My Settings > Alert Contacts
2. Add Email: your-email@example.com
3. Add Slack webhook (optional)
4. Add SMS (optional - premium feature)

### 4. Configure Alert Thresholds

1. Edit monitor settings
2. Alert when down for: 2 checks (10 minutes)
3. Send notifications: Every time
4. Alert via: Email, Slack, SMS

## Cloudflare Worker Alerts

In addition to external monitoring, configure Cloudflare's built-in alerts:

### Worker Failure Alerts

1. Cloudflare Dashboard > Workers & Pages > update-sensor-data
2. Navigate to: Settings > Triggers > Cron Triggers
3. Enable: "Email me when this worker has errors"
4. Add email: your-email@example.com

### Steps to Configure

1. Log into Cloudflare dashboard
2. Navigate to: Notifications
3. Add notification:
   - Event: Worker error rate increased
   - Worker: update-sensor-data
   - Threshold: 10% error rate
   - Trigger: When exceeded for 5 minutes
4. Add notification:
   - Event: Worker CPU time exceeded
   - Worker: update-sensor-data
   - Threshold: 50ms average
5. Add notification:
   - Event: Worker error rate increased
   - Worker: scrape-location-names
   - Same settings as above

## Alert Response Procedures

### When Health Check Fails

1. **Check monitoring endpoint manually:**
   ```bash
   curl https://theride.ie/api/stats/monitoring.json | jq .
   ```

2. **Verify is_healthy and worker_likely_ran:**
   - `is_healthy: false` → Today's data is < 70% of yesterday
   - `worker_likely_ran: false` → No new data today

3. **Check Cloudflare Worker logs:**
   ```bash
   # Check update-sensor-data worker
   cd workers/update-sensor-data
   npm run tail
   ```

4. **Manually trigger worker if needed:**
   - Cloudflare Dashboard > Workers & Pages > update-sensor-data
   - Triggers > Cron Triggers > "Send test event"

5. **Investigate errors in logs:**
   - Look for Telraam API failures
   - Check for database connection issues
   - Verify API key is valid

### When Worker Alerts Fire

1. **Check recent executions:**
   - Cloudflare Dashboard > Workers & Pages > [worker-name]
   - View execution history and error logs

2. **Common failure modes:**
   - Telraam API rate limiting (429 errors)
   - Telraam API downtime (500 errors)
   - Database connection timeout
   - Worker timeout (10 minutes max)

3. **Recovery steps:**
   - If API rate limited: Wait 1 hour, then manually trigger
   - If API down: Wait for Telraam recovery
   - If database issue: Check Cloudflare D1 status
   - If timeout: Check batch size and API delays

## Testing Your Monitoring Setup

```bash
# 1. Verify monitoring endpoint works
curl https://theride.ie/api/stats/monitoring.json | jq .

# 2. Simulate unhealthy state (requires breaking the worker temporarily)
# This should trigger your alert within 10 minutes

# 3. Verify alert received via email/Slack

# 4. Restore worker to fix "unhealthy" state
```

## Monitoring Checklist

- [ ] External health check configured (UptimeRobot)
- [ ] Keyword alert for is_healthy set up
- [ ] Alert contacts added (email, Slack)
- [ ] Cloudflare worker alerts enabled
- [ ] Worker error rate notifications configured
- [ ] Test monitoring by simulating failure
- [ ] Document alert response procedures
- [ ] Share monitoring access with team
```

**Step 2: Commit monitoring documentation**

```bash
git add docs/MONITORING.md
git commit -m "docs: add comprehensive monitoring and alerting guide

- Document monitoring endpoint usage
- Provide UptimeRobot setup instructions
- Configure Cloudflare worker alerts
- Include alert response procedures
- Add testing and verification steps

Addresses: AUDIT_ISSUES.md #13

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 3: Set up monitoring (manual action required)**

Follow the steps in `docs/MONITORING.md` to configure external monitoring.

---

### Task 10: Add Retry Logic to Workers

**Risk Level:** MEDIUM - Data reliability (Issue #16)

**Files:**
- Create: `workers/shared/fetch-with-retry.ts` (shared utility)
- Modify: `workers/update-sensor-data/index.ts:222-238`
- Modify: `workers/scrape-location-names/index.ts:88-99`

**Step 1: Create shared retry utility**

Create `workers/shared/fetch-with-retry.ts`:

```typescript
/**
 * Fetch with exponential backoff retry
 * Shared utility for all workers
 */

export interface RetryOptions {
  maxRetries?: number; // Default: 3
  initialDelayMs?: number; // Default: 1000
  maxDelayMs?: number; // Default: 10000
  backoffFactor?: number; // Default: 2
}

export class RetryError extends Error {
  constructor(
    message: string,
    public attempts: number,
    public lastError: Error
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Fetch with exponential backoff retry
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffFactor = 2,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetch attempt ${attempt + 1}/${maxRetries + 1}: ${url}`);

      const response = await fetch(url, init);

      // Consider 5xx and 429 as retriable errors
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Success - return response
      return response;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Fetch attempt ${attempt + 1} failed:`, lastError.message);

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      const delayMs = Math.min(
        initialDelayMs * Math.pow(backoffFactor, attempt),
        maxDelayMs
      );

      console.log(`Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }

  throw new RetryError(
    `Failed after ${maxRetries + 1} attempts`,
    maxRetries + 1,
    lastError!
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Step 2: Update update-sensor-data worker**

Modify `workers/update-sensor-data/index.ts`:

```typescript
// Add import at top
import { fetchWithRetry, RetryError } from '../shared/fetch-with-retry';

// Replace fetchHourlyData function's fetch call (lines 222-238)
async function fetchHourlyData(
  apiKey: string,
  segmentId: string,
  startTime: Date,
  endTime: Date
): Promise<TelraamHourlyReport[]> {

  const body = {
    level: 'segments',
    format: 'per-hour',
    id: segmentId,
    time_start: formatTelraamDateTime(startTime),
    time_end: formatTelraamDateTime(endTime),
  };

  console.log(`Fetching data for segment ${segmentId} from ${body.time_start} to ${body.time_end}`);

  try {
    const response = await fetchWithRetry(
      'https://telraam-api.net/v1/reports/traffic',
      {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      {
        maxRetries: 3,
        initialDelayMs: 2000, // Start with 2 seconds
        maxDelayMs: 10000, // Max 10 seconds
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telraam API error for segment ${segmentId}: ${response.status} ${errorText}`);
    }

    const data: TelraamTrafficResponse = await response.json();
    return data.report || [];

  } catch (error) {
    if (error instanceof RetryError) {
      console.error(`Failed to fetch data for segment ${segmentId} after ${error.attempts} attempts`);
      console.error(`Last error: ${error.lastError.message}`);
    }
    throw error;
  }
}
```

**Step 3: Update scrape-location-names worker**

Similar pattern - replace fetch with fetchWithRetry in the scraping function.

**Step 4: Test retry logic locally**

```bash
cd workers/update-sensor-data

# Build worker
npm run build

# Test locally (this will test retry on actual API)
npx wrangler dev -c wrangler.toml

# Trigger manually and watch logs
```

Expected: Should see retry attempts in logs if API call fails

**Step 5: Deploy workers with retry logic**

```bash
# Deploy update-sensor-data worker
cd workers/update-sensor-data
npm run deploy

# Deploy scrape-location-names worker
cd ../scrape-location-names
npm run deploy

cd ../..
```

**Step 6: Commit retry implementation**

```bash
git add workers/shared/fetch-with-retry.ts workers/update-sensor-data/index.ts workers/scrape-location-names/index.ts
git commit -m "reliability: add exponential backoff retry to worker API calls

- Create shared fetchWithRetry utility
- Implement exponential backoff (2s, 4s, 8s)
- Retry on 5xx errors and 429 rate limits
- Max 3 retries with 10s cap
- Improves resilience to temporary API failures

Addresses: AUDIT_ISSUES.md #16

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Code Quality & Hardening (Week 4)

### Task 11: Validate Telraam API Responses

**Risk Level:** MEDIUM - Data corruption prevention (Issue #37)

**Files:**
- Create: `workers/shared/telraam-schema.ts`
- Modify: `workers/update-sensor-data/index.ts:236-237`

**Step 1: Install Zod in worker**

```bash
cd workers/update-sensor-data
npm install zod
cd ../..
```

**Step 2: Create Telraam response schema**

Create `workers/shared/telraam-schema.ts`:

```typescript
import { z } from 'zod';

/**
 * Zod schemas for validating Telraam API responses
 */

export const TelraamHourlyReportSchema = z.object({
  date: z.string().min(1), // "2025-12-01" or ISO timestamp
  hour: z.number().int().min(0).max(23).optional(), // May not be present if date is full ISO
  uptime: z.number().min(0).max(1),
  heavy: z.number().int().min(0),
  car: z.number().int().min(0),
  bike: z.number().int().min(0),
  pedestrian: z.number().int().min(0),
  v85: z.number().min(0).optional(),
});

export const TelraamTrafficResponseSchema = z.object({
  report: z.array(TelraamHourlyReportSchema),
});

export type TelraamHourlyReport = z.infer<typeof TelraamHourlyReportSchema>;
export type TelraamTrafficResponse = z.infer<typeof TelraamTrafficResponseSchema>;
```

**Step 3: Add validation to worker**

Modify `workers/update-sensor-data/index.ts`:

```typescript
// Add import at top
import { TelraamTrafficResponseSchema } from '../shared/telraam-schema';

// In fetchHourlyData, validate response before returning (after line 236)
const data: TelraamTrafficResponse = await response.json();

// Validate response structure
const validation = TelraamTrafficResponseSchema.safeParse(data);

if (!validation.success) {
  console.error(`Invalid Telraam API response for segment ${segmentId}:`, validation.error);
  throw new Error(`Invalid API response structure: ${validation.error.message}`);
}

return validation.data.report || [];
```

**Step 4: Build and test**

```bash
cd workers/update-sensor-data
npm run build
```

Expected: Build succeeds

**Step 5: Deploy updated worker**

```bash
npm run deploy
cd ../..
```

**Step 6: Commit validation**

```bash
git add workers/shared/telraam-schema.ts workers/update-sensor-data/index.ts workers/update-sensor-data/package.json
git commit -m "security: validate Telraam API responses with Zod schemas

- Create Zod schemas for Telraam API data structure
- Validate all API responses before database insertion
- Prevent malformed data from corrupting database
- Log validation errors for monitoring

Addresses: AUDIT_ISSUES.md #37

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 12: Extract Duplicate Date Formatting Logic

**Risk Level:** LOW - Code maintainability (Issue #14)

**Files:**
- Create: `src/utils/date-formatting.ts`
- Modify: `src/utils/db.ts:19-24, 318-326, 427-442`
- Modify: `workers/update-sensor-data/index.ts:371-380`

**Step 1: Create shared date utility**

Create `src/utils/date-formatting.ts`:

```typescript
/**
 * Shared date formatting utilities
 * Used across API routes, database utilities, and workers
 */

/**
 * Format a Date object to ISO8601 datetime string
 * Format: YYYY-MM-DD HH:MM:SSZ
 *
 * @example
 * formatDateTime(new Date('2026-02-03T10:30:45Z'))
 * // Returns: "2026-02-03 10:30:45Z"
 */
export function formatDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}Z`;
}

/**
 * Format a Date object to ISO8601 date string
 * Format: YYYY-MM-DD
 *
 * @example
 * formatDate(new Date('2026-02-03T10:30:45Z'))
 * // Returns: "2026-02-03"
 */
export function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Format a Date object to midnight boundary timestamp
 * Format: YYYY-MM-DD 00:00:00Z
 *
 * @example
 * formatMidnight(new Date('2026-02-03T10:30:45Z'))
 * // Returns: "2026-02-03 00:00:00Z"
 */
export function formatMidnight(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day} 00:00:00Z`;
}
```

**Step 2: Replace duplicated logic in db.ts**

Modify `src/utils/db.ts`:

```typescript
// Add import at top
import { formatMidnight, formatDate, formatDateTime } from './date-formatting';

// Replace getYesterdayDateRange function (lines 9-30)
export function getYesterdayDateRange(): { start: string; end: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  const today = new Date(yesterday);
  today.setUTCDate(today.getUTCDate() + 1);

  return {
    start: formatMidnight(yesterday),
    end: formatMidnight(today),
  };
}

// Replace formatDate in getMonitoringData (lines 427-442)
// Use imported formatDate and formatDateTime instead
```

**Step 3: Copy utility to workers (workers can't import from src)**

```bash
# Workers need their own copy since they're separate builds
cp src/utils/date-formatting.ts workers/shared/date-formatting.ts
```

**Step 4: Replace logic in update-sensor-data worker**

Modify `workers/update-sensor-data/index.ts`:

```typescript
// Add import at top
import { formatDateTime } from '../shared/date-formatting';

// Remove the formatTelraamDateTime function (lines 371-380)
// Replace all calls to formatTelraamDateTime with formatDateTime
```

**Step 5: Build and test**

```bash
# Test main build
npm run build

# Test worker build
cd workers/update-sensor-data
npm run build
cd ../..
```

Expected: Both builds succeed

**Step 6: Commit refactoring**

```bash
git add src/utils/date-formatting.ts src/utils/db.ts workers/shared/date-formatting.ts workers/update-sensor-data/index.ts
git commit -m "refactor: extract duplicate date formatting logic to shared utility

- Create date-formatting.ts with formatDate, formatDateTime, formatMidnight
- Replace 5+ duplicate implementations across codebase
- Improve maintainability and consistency
- Add JSDoc comments for all functions

Addresses: AUDIT_ISSUES.md #14

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary and Next Steps

### Completed Tasks

This plan addresses 12 critical and high-priority security issues:

✅ **Critical Issues (Week 1):**
1. API key exposure mitigation
2. Authentication for write endpoints
3. Input validation with Zod
4. Site URL configuration fix

✅ **High Priority (Week 2):**
5. Database indexes for performance
6. Production error information hiding
7. Cache-Control headers

✅ **Medium Priority (Week 3-4):**
8. Rate limiting documentation
9. Worker monitoring setup
10. Retry logic for external APIs
11. Telraam response validation
12. Code deduplication

### Remaining Issues (for future iterations)

**From AUDIT_ISSUES.md:**
- Issues #3, #6, #15, #17-40 (lower priority)
- See audit document for full details

### Security Posture After This Plan

**Protections Added:**
- ✅ Authentication on write endpoints
- ✅ Input validation prevents injection and DoS
- ✅ Rate limiting (via Cloudflare)
- ✅ Caching reduces attack surface
- ✅ Monitoring detects failures
- ✅ Retry logic improves reliability
- ✅ Response validation prevents data corruption

**Remaining Gaps:**
- No tests (Issue #19)
- Schema mismatch in database (Issue #6)
- No API versioning (Issue #38)
- Hardcoded configuration values (Issue #15)

### Deployment Checklist

Before deploying these changes to production:

- [ ] Rotate Telraam API key
- [ ] Generate and configure ADMIN_API_KEY in Cloudflare
- [ ] Run database migration 0005 on production
- [ ] Configure Cloudflare rate limiting rules
- [ ] Set up external monitoring (UptimeRobot)
- [ ] Enable Cloudflare worker alerts
- [ ] Test all endpoints with new authentication
- [ ] Verify cache headers in production
- [ ] Monitor worker logs for retry attempts
- [ ] Document admin API key in password manager

### Testing Recommendations

**Manual Testing Required:**
1. Test authentication with valid/invalid keys
2. Verify rate limiting blocks excessive requests
3. Confirm monitoring alerts fire correctly
4. Test retry logic with simulated API failures
5. Validate input rejection with malformed requests

**Future: Automated Testing:**
- Add Vitest unit tests for validation schemas
- Add integration tests for API endpoints
- Add E2E tests with Playwright
- Add worker tests with Miniflare

---

## Execution Options

This plan is ready for implementation. Choose your execution approach:

**Option 1: Subagent-Driven (Current Session)**
- I dispatch fresh subagent per task
- Review code between tasks
- Fast iteration in this session

**Option 2: Parallel Session (Separate)**
- Open new session with executing-plans skill
- Batch execution with checkpoints
- Work independently

Which approach would you prefer?
