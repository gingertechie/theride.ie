/**
 * Authentication utilities for API endpoints
 * Implements timing-safe token comparison to prevent timing attacks
 */

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a First string to compare
 * @param b Second string to compare
 * @returns true if strings are equal, false otherwise
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Verify admin authentication via Bearer token
 * @param request Request object containing Authorization header
 * @param env Environment variables containing ADMIN_API_KEY
 * @returns true if authenticated, false otherwise
 */
export function verifyAdminAuth(request: Request, env: any): boolean {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const adminKey = env.ADMIN_API_KEY;

  if (!adminKey) {
    console.error('ADMIN_API_KEY not configured in environment');
    return false;
  }

  return timingSafeEqual(token, adminKey);
}

/**
 * Create a standardized 401 Unauthorized response
 * @returns Response object with 401 status
 */
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Unauthorized - Valid API key required',
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
      },
    }
  );
}
