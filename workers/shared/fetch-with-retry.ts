/**
 * Fetch with Retry Utility
 * Implements exponential backoff retry logic for external API calls
 */

export interface RetryOptions {
  maxRetries?: number; // Default: 3
  initialDelayMs?: number; // Default: 1000
  maxDelayMs?: number; // Default: 30000
  retryableStatuses?: number[]; // Default: [408, 429, 500, 502, 503, 504]
}

export class RetryError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(message: string, attempts: number, lastError: Error) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Fetch with exponential backoff retry
 *
 * @param url - URL to fetch
 * @param init - Fetch options
 * @param options - Retry configuration
 * @returns Response if successful
 * @throws RetryError if all retries exhausted
 */
export async function fetchWithRetry(
  url: string | URL | Request,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    retryableStatuses = [408, 429, 500, 502, 503, 504],
  } = options ?? {};

  let lastError: Error | null = null;
  let attempt = 0;

  for (attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      // Check if response status is retryable
      if (!response.ok && retryableStatuses.includes(response.status)) {
        const errorText = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);

        // Don't retry on last attempt
        if (attempt < maxRetries) {
          const delay = calculateBackoffDelay(attempt, initialDelayMs, maxDelayMs);
          console.log(
            `Retryable error (${response.status}) on attempt ${attempt + 1}/${maxRetries + 1}. ` +
            `Retrying in ${delay}ms...`
          );
          await sleep(delay);
          continue;
        }
      }

      // Success or non-retryable error
      return response;

    } catch (error) {
      // Network error, timeout, or fetch failure
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt < maxRetries) {
        const delay = calculateBackoffDelay(attempt, initialDelayMs, maxDelayMs);
        console.log(
          `Network error on attempt ${attempt + 1}/${maxRetries + 1}: ${lastError.message}. ` +
          `Retrying in ${delay}ms...`
        );
        await sleep(delay);
        continue;
      }
    }
  }

  // All retries exhausted
  throw new RetryError(
    `Failed after ${attempt} attempts`,
    attempt,
    lastError ?? new Error('Unknown error')
  );
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attemptNumber: number,
  initialDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelayMs * Math.pow(2, attemptNumber);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (±25% randomness)
  const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
  const delayWithJitter = cappedDelay + jitter;

  return Math.floor(delayWithJitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
