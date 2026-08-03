/** Gemini retry handling with server-directed backoff. */

const MAX_SERVER_RETRY_DELAY_MS = 60_000;

interface ErrorLike {
  message?: unknown;
  response?: { status?: unknown };
  status?: unknown;
  statusCode?: unknown;
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as ErrorLike | null)?.message;
  return typeof message === 'string' ? message : String(error ?? '');
}

function errorStatus(error: unknown): number | undefined {
  const candidate = error as ErrorLike | null;
  const value = candidate?.status ?? candidate?.statusCode ?? candidate?.response?.status;
  return typeof value === 'number' ? value : undefined;
}

/** Extracts Google's RetryInfo delay or its equivalent human-readable delay. */
export function getGeminiRetryDelayMs(error: unknown): number | null {
  const message = errorMessage(error);
  const match = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i)
    ?? message.match(/(?:please\s+)?retry\s+in\s+(\d+(?:\.\d+)?)s/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : null;
}

function isDailyQuota(error: unknown): boolean {
  return /quotaId[^\n]*PerDay|requests\s+per\s+day/i.test(errorMessage(error));
}

/**
 * Checks if the error is transient and should be retried.
 */
function isTransientError(error: unknown): boolean {
  if (!error) return false;

  const status = errorStatus(error);
  if (status === 503) return true;
  if (status === 429) return !isDailyQuota(error) || getGeminiRetryDelayMs(error) !== null;

  const message = errorMessage(error).toLowerCase();
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

function terminalError(error: unknown): Error {
  const status = errorStatus(error);
  if (status !== 429) return error instanceof Error ? error : new Error(errorMessage(error));

  const retryAfterMs = getGeminiRetryDelayMs(error);
  const wait = retryAfterMs === null
    ? 'Wait for the quota window to reset.'
    : `Retry in about ${Math.max(1, Math.ceil(retryAfterMs / 1000))} seconds.`;
  const message = `${isDailyQuota(error) ? 'Gemini free-tier quota is exhausted for the selected model.' : 'Gemini rate limit reached.'} ${wait} You can also select another model or use an API key with available quota.`;
  return Object.assign(new Error(message), { status: 429, retryAfterMs });
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
    } catch (error: unknown) {
      attempt++;

      if (attempt > maxRetries || !isTransientError(error)) {
        console.error(`[Gemini Retry] Request failed after ${attempt} attempt${attempt === 1 ? '' : 's'} (${errorStatus(error) ?? 'unknown status'}).`);
        throw terminalError(error);
      }

      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 1000;
      const serverDelay = getGeminiRetryDelayMs(error);
      if (serverDelay !== null && serverDelay > MAX_SERVER_RETRY_DELAY_MS) {
        console.error(`[Gemini Retry] Server requested ${Math.ceil(serverDelay / 1000)}s delay; failing fast.`);
        throw terminalError(error);
      }
      const totalDelay = serverDelay === null
        ? exponentialDelay + jitter
        : Math.min(MAX_SERVER_RETRY_DELAY_MS, serverDelay + 250);

      console.warn(
        `[Gemini Retry] ${errorStatus(error) ?? 'Transient error'}. Retry ${attempt}/${maxRetries} in ${Math.ceil(totalDelay / 1000)}s${serverDelay === null ? '' : ' (server requested)'}.`
      );

      await delay(totalDelay);
    }
  }
}
