# Add Testing Infrastructure and Fix TypeScript Errors

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive test infrastructure with a top-level test command and fix all TypeScript compilation errors.

**Architecture:** Set up Vitest for unit/integration testing, configure TypeScript strict mode enforcement via CI, fix blog collection type issues causing 7 TS errors.

**Tech Stack:** Vitest, TypeScript, Astro Content Collections, npm scripts

---

## Task 1: Add Vitest Test Infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/example.test.ts`

**Step 1: Install Vitest and dependencies**

```bash
npm install --save-dev vitest @vitest/ui
```

Expected: Dependencies added to devDependencies

**Step 2: Create Vitest configuration**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Step 3: Add test scripts to package.json**

Modify `package.json` scripts section:

```json
{
  "scripts": {
    "dev": "astro dev",
    "dev:wrangler": "wrangler pages dev --compatibility-date=2024-11-28 --d1=DB=theride-db -- astro dev",
    "start": "astro dev",
    "build": "astro check && astro build",
    "preview": "wrangler pages dev ./dist --d1=DB=theride-db",
    "test": "npm run test:unit && npm run test:typecheck",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:typecheck": "astro check",
    "test:coverage": "vitest run --coverage",
    "backfill": "npx tsx scripts/backfill-sensor-data.ts",
    "db:init-local": "npx wrangler d1 execute theride-db --local --config=wrangler.toml --file=./db/schema.sql && npx wrangler d1 execute theride-db --local --config=wrangler.toml --file=./db/migrations/0001_seed_sensor_locations.sql",
    "db:query-local": "npx wrangler d1 execute theride-db --local --config=wrangler.toml --command",
    "db:query-remote": "npx wrangler d1 execute theride-db --remote --command",
    "astro": "astro"
  }
}
```

**Step 4: Create example test file**

Create `tests/example.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Test Infrastructure', () => {
  it('should run basic assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async tests', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
```

**Step 5: Run tests to verify setup**

```bash
npm run test:unit
```

Expected: 2 passing tests

**Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/example.test.ts
git commit -m "feat: add Vitest testing infrastructure with example tests

- Install vitest and @vitest/ui
- Create vitest.config.ts with path alias support
- Add test scripts: test, test:unit, test:unit:watch, test:typecheck, test:coverage
- Add example.test.ts to verify test infrastructure works
- Top-level 'npm test' now runs both unit tests and TypeScript checks"
```

---

## Task 2: Fix Blog Collection Type Errors

**Files:**
- Modify: `src/content/config.ts`
- Modify: `src/components/ui/ArticleCard.astro:32`
- Modify: `src/pages/articles/[...slug].astro:21`
- Modify: `src/pages/articles/search.astro:18,22`
- Modify: `src/pages/articles/api/search.json.ts:33,37`

**Step 1: Add blog collection schema**

The blog collection is being auto-generated because it's not defined in config. Add it to `src/content/config.ts`:

```typescript
import { defineCollection, z } from 'astro:content';

const knowledgeCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
    readTime: z.string(),
    pubDate: z.date(),
    updatedDate: z.date().optional(),
  }),
});

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    author: z.string(),
    authImage: z.string(),
    image: z.string(),
    tags: z.array(z.string()),
    summary: z.string(),
    type: z.enum(['Article', 'Tutorial']),
  }),
});

export const collections = {
  knowledge: knowledgeCollection,
  blog: blogCollection,
};
```

**Step 2: Run type check**

```bash
npm run test:typecheck
```

Expected: Still 5 errors remaining (slug, body, render issues)

**Step 3: Fix ArticleCard.astro slug access**

The `slug` property doesn't exist on collection entries. Use `id` instead (which is the filename without extension).

In `src/components/ui/ArticleCard.astro`, change line 32:

```astro
<a href={'/articles/' + article.id} class="inline-flex items-center font-medium text-black hover:text-green">
```

**Step 4: Fix article slug access in search.astro**

In `src/pages/articles/search.astro`, change line 22:

```typescript
const slugMatch: boolean = article.id
  .toLowerCase()
  .includes(searchTerm);
```

Also fix line 18 to handle optional body:

```typescript
const bodyMatch: boolean = article.body
  ? article.body.toLowerCase().includes(searchTerm)
  : false;
```

**Step 5: Fix article slug access in search API**

In `src/pages/articles/api/search.json.ts`, change line 37:

```typescript
const slugMatch: boolean = article.id
  .toLowerCase()
  .includes(searchTerm);
```

Also fix line 33:

```typescript
const bodyMatch: boolean = article.body
  ? article.body.toLowerCase().includes(searchTerm)
  : false;
```

**Step 6: Fix render method in article page**

In `src/pages/articles/[...slug].astro`, change line 21:

```astro
const { Content } = await entry.render();
```

to:

```astro
const { Content } = entry.rendered ? { Content: () => entry.rendered!.html } : await entry.render();
```

Actually, looking at Astro 5.x docs, `render()` should exist. This might be a type issue. Let's use the correct approach:

```typescript
const { Content } = await entry.render();
```

If the type error persists, it's because the type definition is outdated. Let's cast it:

```typescript
const { Content } = await (entry as any).render();
```

But better approach - check if there's a `render` function:

Actually, in Astro 5.x content collections, you should use:

```astro
---
import { getEntry, render } from 'astro:content';

const { slug } = Astro.params;

if(!slug) {
  return Astro.redirect('/404');
}

const entry = await getEntry('blog', slug);

if(entry === undefined) {
  return Astro.redirect('/404');
}

const { Content } = await render(entry);
---
```

**Step 7: Run type check to verify all fixes**

```bash
npm run test:typecheck
```

Expected: 0 errors

**Step 8: Commit**

```bash
git add src/content/config.ts src/components/ui/ArticleCard.astro src/pages/articles/\[...slug\].astro src/pages/articles/search.astro src/pages/articles/api/search.json.ts
git commit -m "fix: resolve TypeScript errors in blog collection usage

- Define blog collection schema in config.ts to prevent auto-generation
- Replace article.slug with article.id (correct collection entry property)
- Add null checks for optional article.body property
- Fix render() usage in article page to use Astro 5.x render() function
- All 7 TypeScript errors now resolved"
```

---

## Task 3: Fix Remaining TypeScript Warnings

**Files:**
- Modify: `src/components/sections/CountiesGrid.astro:48`
- Modify: `src/components/sections/BusiestHour.astro:14`
- Modify: `src/components/ui/Navbar.astro:2,40`
- Modify: `src/components/ui/Tags.astro:9`
- Modify: `src/pages/api/sensors/[id].json.ts:2`
- Modify: `src/pages/articles/index.astro:8`

**Step 1: Fix invalid name attribute on h2**

In `src/components/sections/CountiesGrid.astro` line 48, replace `name` with `id`:

```astro
<h2 id="counties" class="text-2xl md:text-4xl text-white mb-4 text-center font-medium">
```

**Step 2: Remove unused timestamp variable**

In `src/components/sections/BusiestHour.astro` line 14, remove unused variable:

```typescript
const { hour, count } = Astro.props;
```

Or prefix with underscore if you want to keep it for documentation:

```typescript
const { hour, count, timestamp: _timestamp } = Astro.props;
```

**Step 3: Remove unused Navbar imports**

In `src/components/ui/Navbar.astro` line 2:

```typescript
import { Astronav } from "astro-navbar";
```

**Step 4: Remove unused index parameters**

In `src/components/ui/Navbar.astro` line 40:

```astro
{menuitems.map((item) => (
```

In `src/components/ui/Tags.astro` line 9:

```astro
{tags.map((tag: string) => (
```

**Step 5: Remove unused import**

In `src/pages/api/sensors/[id].json.ts` line 2:

```typescript
import { getSensorById, upsertSensor, deleteSensor } from '@/utils/db';
```

**Step 6: Remove unused variable**

In `src/pages/articles/index.astro` line 8, either use it or remove it. If it should be used for pagination, implement it. Otherwise:

```typescript
// Remove the line entirely if not used
```

**Step 7: Run type check**

```bash
npm run test:typecheck
```

Expected: 0 errors, 0 warnings

**Step 8: Commit**

```bash
git add src/components/sections/CountiesGrid.astro src/components/sections/BusiestHour.astro src/components/ui/Navbar.astro src/components/ui/Tags.astro src/pages/api/sensors/\[id\].json.ts src/pages/articles/index.astro
git commit -m "refactor: remove unused variables and fix HTML attribute issues

- Replace invalid 'name' attribute with 'id' on h2 element
- Remove unused imports and variables across components
- Clean up map function parameters that don't use index
- Eliminates all TypeScript warnings for cleaner build output"
```

---

## Task 4: Add Utility Function Tests

**Files:**
- Create: `tests/utils/date-formatting.test.ts`

**Step 1: Write test for date formatting utility**

Create `tests/utils/date-formatting.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatDateRange, formatDate } from '../../src/utils/date-formatting';

describe('Date Formatting Utils', () => {
  describe('formatDate', () => {
    it('should format ISO date string correctly', () => {
      const result = formatDate('2024-01-15T10:30:00Z');
      expect(result).toMatch(/2024-01-15/);
    });

    it('should handle date objects', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDate(date.toISOString());
      expect(result).toMatch(/2024-01-15/);
    });
  });

  describe('formatDateRange', () => {
    it('should format date range with start and end', () => {
      const start = '2024-01-01T00:00:00Z';
      const end = '2024-01-31T23:59:59Z';
      const result = formatDateRange(start, end);
      expect(result).toContain('2024-01-01');
      expect(result).toContain('2024-01-31');
    });

    it('should handle single date when start equals end', () => {
      const date = '2024-01-15T00:00:00Z';
      const result = formatDateRange(date, date);
      expect(result).toBeTruthy();
    });
  });
});
```

**Step 2: Run tests**

```bash
npm run test:unit
```

Expected: All tests passing (including new date formatting tests)

**Step 3: Commit**

```bash
git add tests/utils/date-formatting.test.ts
git commit -m "test: add unit tests for date formatting utilities

- Test formatDate() with ISO strings and Date objects
- Test formatDateRange() with different date ranges
- Verify date formatting consistency across utils"
```

---

## Task 5: Add API Schema Validation Tests

**Files:**
- Create: `tests/schemas/api.test.ts`

**Step 1: Write test for API schemas**

Create `tests/schemas/api.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  SensorIdParamSchema,
  CountyParamSchema,
  SearchQuerySchema,
  CreateSensorSchema,
  UpdateSensorSchema,
} from '../../src/schemas/api';

describe('API Schemas', () => {
  describe('SensorIdParamSchema', () => {
    it('should validate valid sensor ID', () => {
      const result = SensorIdParamSchema.safeParse({ id: '12345' });
      expect(result.success).toBe(true);
    });

    it('should reject empty ID', () => {
      const result = SensorIdParamSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing ID', () => {
      const result = SensorIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('CountyParamSchema', () => {
    it('should validate valid county name', () => {
      const result = CountyParamSchema.safeParse({ county: 'dublin' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid county', () => {
      const result = CountyParamSchema.safeParse({ county: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('SearchQuerySchema', () => {
    it('should validate valid search query', () => {
      const result = SearchQuerySchema.safeParse({ q: 'sensor' });
      expect(result.success).toBe(true);
    });

    it('should provide default empty string for missing query', () => {
      const result = SearchQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe('');
      }
    });
  });

  describe('CreateSensorSchema', () => {
    it('should validate complete sensor data', () => {
      const validSensor = {
        segment_id: '123',
        last_data_package: '2024-01-15T10:00:00Z',
        timezone: 'Europe/Dublin',
        date: '2024-01-15',
        interval: 'hourly',
        uptime: 0.95,
        heavy: 10,
        car: 50,
        bike: 20,
        pedestrian: 15,
        v85: 35.5,
        latitude: 53.3498,
        longitude: -6.2603,
      };
      const result = CreateSensorSchema.safeParse(validSensor);
      expect(result.success).toBe(true);
    });

    it('should reject invalid uptime range', () => {
      const invalidSensor = {
        segment_id: '123',
        uptime: 1.5, // Invalid: > 1
        heavy: 0,
        car: 0,
        bike: 0,
        pedestrian: 0,
      };
      const result = CreateSensorSchema.safeParse(invalidSensor);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateSensorSchema', () => {
    it('should validate partial sensor updates', () => {
      const result = UpdateSensorSchema.safeParse({ bike: 25 });
      expect(result.success).toBe(true);
    });

    it('should allow empty updates', () => {
      const result = UpdateSensorSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
```

**Step 2: Run tests**

```bash
npm run test:unit
```

Expected: All schema validation tests passing

**Step 3: Commit**

```bash
git add tests/schemas/api.test.ts
git commit -m "test: add comprehensive API schema validation tests

- Test SensorIdParamSchema validation and error cases
- Test CountyParamSchema validation
- Test SearchQuerySchema with defaults
- Test CreateSensorSchema with valid/invalid data
- Test UpdateSensorSchema for partial updates
- Ensures API input validation is working correctly"
```

---

## Task 6: Add CI TypeScript Check Enforcement

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run TypeScript checks
        run: npm run test:typecheck

      - name: Run unit tests
        run: npm run test:unit

      - name: Build project
        run: npm run build
```

**Step 2: Test workflow locally (optional)**

If you have `act` installed:

```bash
act -j test
```

Otherwise, skip to commit.

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for TypeScript and test checks

- Run TypeScript type checking on all pushes and PRs
- Run unit tests to catch regressions
- Build project to ensure production build succeeds
- Enforces code quality standards before merge"
```

---

## Task 7: Update CLAUDE.md with Testing Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add testing section to CLAUDE.md**

Add after the "Build and Development Commands" section:

```markdown
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
```

**Step 2: Run full test suite to verify everything**

```bash
npm test
```

Expected: All tests passing, 0 TypeScript errors

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add comprehensive testing documentation to CLAUDE.md

- Document all test commands and their purposes
- Explain test directory structure and conventions
- Provide testing guidelines for future development
- Reference CI/CD enforcement of test quality"
```

---

## Task 8: Add README for Tests Directory

**Files:**
- Create: `tests/README.md`

**Step 1: Create tests README**

Create `tests/README.md`:

```markdown
# Tests

This directory contains all test files for The Ride project.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:unit:watch

# Run with coverage report
npm run test:coverage
```

## Test Structure

```
tests/
├── README.md           # This file
├── example.test.ts     # Example test demonstrating Vitest setup
├── schemas/
│   └── api.test.ts     # API schema validation tests
└── utils/
    └── date-formatting.test.ts  # Date utility tests
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '@/utils/myFunction';

describe('MyFunction', () => {
  it('should do something specific', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### Testing Best Practices

1. **One assertion per test** - Tests should verify one behavior
2. **Clear test names** - Use "should [expected behavior]" format
3. **AAA pattern** - Arrange, Act, Assert
4. **Test edge cases** - Empty inputs, null, undefined, boundaries
5. **Mock external dependencies** - Database, API calls, file system

### Path Aliases

Tests support the `@/*` path alias:

```typescript
import { formatDate } from '@/utils/date-formatting';
import { SensorSchema } from '@/schemas/api';
```

## Test Categories

### Unit Tests (`tests/utils/`, `tests/schemas/`)

Test individual functions and modules in isolation.

Example: Date formatting, schema validation, utility functions

### Integration Tests (future)

Test how multiple modules work together.

Example: API endpoint handlers, database operations

### E2E Tests (future)

Test complete user workflows.

Example: Page rendering, form submissions, navigation

## Coverage

Generate coverage reports:

```bash
npm run test:coverage
```

Coverage reports are generated in `coverage/` directory (gitignored).

Aim for:
- **Utilities**: 90%+ coverage
- **Schemas**: 100% coverage (easy to achieve)
- **Components**: 70%+ coverage
- **Pages**: 50%+ coverage (integration tests better)

## CI/CD

All tests run automatically on:
- Pull requests to `main`
- Pushes to `main`

PRs cannot merge with:
- Failing tests
- TypeScript errors
- Build failures
```

**Step 2: Commit**

```bash
git add tests/README.md
git commit -m "docs: add comprehensive testing guide in tests/README.md

- Explain test structure and organization
- Document testing best practices and patterns
- Provide examples for writing new tests
- Set coverage expectations for different code categories
- Reference CI/CD test enforcement"
```

---

## Final Verification

**Step 1: Run complete test suite**

```bash
npm test
```

Expected output:
```
> test
> npm run test:unit && npm run test:typecheck

> test:unit
> vitest run

✓ tests/example.test.ts (2 tests)
✓ tests/utils/date-formatting.test.ts (4 tests)
✓ tests/schemas/api.test.ts (11 tests)

Test Files  3 passed (3)
     Tests  17 passed (17)

> test:typecheck
> astro check

Result (61 files):
- 0 errors
- 0 warnings
- 0 hints
```

**Step 2: Verify build still works**

```bash
npm run build
```

Expected: Clean build with 0 errors

**Step 3: Create summary of changes**

All tasks completed:
1. ✅ Vitest infrastructure with top-level `npm test` command
2. ✅ Fixed all 7 TypeScript errors in blog collection usage
3. ✅ Cleaned up TypeScript warnings (unused variables, invalid attributes)
4. ✅ Added unit tests for date formatting utilities
5. ✅ Added comprehensive API schema validation tests
6. ✅ Added GitHub Actions CI workflow for enforcement
7. ✅ Updated CLAUDE.md with testing documentation
8. ✅ Created tests/README.md with testing guide

**Test coverage:** 17 tests across 3 test files, 0 TypeScript errors, CI enforcement in place.
