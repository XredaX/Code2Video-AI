/**
 * Gemini API Retry Utility
 * Handles transient errors like 503 (Service Unavailable) and 429 (Too Many Requests)
 * using exponential backoff with random jitter.
 */

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks if the error is transient and should be retried.
 */
function isTransientError(error: any): boolean {
  if (!error) return false;

  // Check HTTP status code if present
  const status = error.status || error.statusCode || error.response?.status;
  if (status === 503 || status === 429) {
    return true;
  }

  // Check error message content
  const message = (error.message || '').toLowerCase();
  const transientIndicators = [
    '503',
    '429',
    'service unavailable',
    'too many requests',
    'rate limit',
    'high demand',
    'overloaded',
    'experiencing high demand',
    'try again later',
  ];

  return transientIndicators.some((indicator) => message.includes(indicator));
}

/**
 * Executes a function with retries on transient errors.
 * @param fn The function to execute.
 * @param maxRetries Maximum number of retries (default: 3).
 * @param baseDelay Base delay in milliseconds (default: 1000).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;

      if (attempt > maxRetries || !isTransientError(error)) {
        console.error(`[Gemini Retry] Error is not transient or max retries reached. Attempt ${attempt}/${maxRetries}. Failing.`);
        throw error;
      }

      // Calculate exponential backoff delay with random jitter (0 to 1000ms)
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 1000;
      const totalDelay = exponentialDelay + jitter;

      console.warn(
        `[Gemini Retry] Transient error encountered (Attempt ${attempt}/${maxRetries}): ${
          error.message || error
        }. Retrying in ${Math.round(totalDelay)}ms...`
      );

      await delay(totalDelay);
    }
  }
}
