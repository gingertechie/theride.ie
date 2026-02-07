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
