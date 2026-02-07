/**
 * Error handling utilities for API endpoints
 * Provides dev/prod mode detection and safe error responses
 */

/**
 * Detect if we're running in development mode
 */
export function isDevelopment(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
}

/**
 * Create a safe error response
 * Shows debug info in development, hides in production
 */
export function errorResponse(error: unknown, userMessage: string): Response {
  const isDev = isDevelopment();

  // Always log errors server-side for monitoring
  console.error('API Error:', error);

  if (isDev) {
    // Development: show full debug info
    return new Response(
      JSON.stringify({
        error: userMessage,
        debug: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } else {
    // Production: hide internal details
    return new Response(
      JSON.stringify({
        error: userMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Create a database unavailable response
 */
export function databaseUnavailableResponse(): Response {
  const isDev = isDevelopment();

  console.error('Database unavailable');

  if (isDev) {
    return new Response(
      JSON.stringify({
        error: 'Database unavailable',
        debug: {
          message: 'D1 database binding not found. Use npm run dev:wrangler for local development.',
          timestamp: new Date().toISOString(),
        },
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } else {
    return new Response(
      JSON.stringify({
        error: 'Service temporarily unavailable',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
