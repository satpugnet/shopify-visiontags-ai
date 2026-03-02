/**
 * Shared retry utility with exponential backoff
 * Used by vision and products services for API rate limit handling
 */

import { logger } from "./logger.server";

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Log event name for retry warnings (default: "API_RETRY") */
  logEvent?: string;
}

/**
 * Retry a function with exponential backoff and jitter.
 * Retries on rate limits (429), server errors (5xx), and transient network issues.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    logEvent = "API_RETRY",
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const errorMsg = lastError.message.toLowerCase();
      const isRetryable =
        errorMsg.includes("429") ||
        errorMsg.includes("throttled") ||
        errorMsg.includes("rate") ||
        errorMsg.includes("500") ||
        errorMsg.includes("502") ||
        errorMsg.includes("503") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("econnreset");

      if (!isRetryable || attempt === maxRetries - 1) {
        throw lastError;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs,
      );
      logger.warn(logEvent, {
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delay),
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
