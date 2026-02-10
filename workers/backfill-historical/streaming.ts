/**
 * Streaming response utilities for real-time progress logs
 */

/**
 * Helper to create a logging function that writes to a stream controller
 */
export function createLogger(controller: ReadableStreamDefaultController) {
  return (msg: string) => {
    controller.enqueue(new TextEncoder().encode(msg + '\n'));
  };
}

/**
 * Custom error class for controlling HTTP response status codes
 */
export class ResponseError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ResponseError';
  }
}

/**
 * Create streaming response with executor function
 * Handles errors and streams progress logs
 */
export function createStreamingResponse(
  executor: (log: (msg: string) => void) => Promise<void>
): Response {

  let statusCode = 200;

  const stream = new ReadableStream({
    async start(controller) {
      const log = createLogger(controller);

      try {
        await executor(log);
      } catch (error) {
        // Handle ResponseError for custom status codes
        if (error instanceof ResponseError) {
          statusCode = error.statusCode;
          log(`❌ Error: ${error.message}`);
        } else {
          // Unexpected error -> 500
          statusCode = 500;
          log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

/**
 * Create error response with plain text message
 */
export function createErrorResponse(statusCode: number, message: string): Response {
  return new Response(`❌ Error: ${message}\n`, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
