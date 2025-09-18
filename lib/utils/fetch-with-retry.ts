/**
 * Utility function to fetch with timeout and retry logic
 * Designed to handle network issues and timeouts in production environments
 */

/**
 * Custom error class for timeout errors to help distinguish them from other failures
 */
export class TimeoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'TimeoutError';
    if (options?.cause) (this as any).cause = options.cause;
  }
}

export interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  timeout?: number;
  onRetry?: (attempt: number, maxRetries: number, error?: Error) => void;
}

/**
 * Performs a fetch request with automatic retry on failure and timeout handling
 *
 * @param url - The URL to fetch from
 * @param options - Fetch options with additional retry configuration
 * @returns The fetch response
 * @throws Error if all retry attempts fail
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    retries = 2,
    timeout = 115000, // 115 seconds (slightly less than typical server timeout)
    onRetry,
    ...fetchOptions
  } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: fetchOptions.signal || controller.signal
      });

      clearTimeout(timeoutId);

      // If successful or client error (4xx), return immediately
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // For server errors (5xx), retry if attempts remain
      if (attempt < retries && response.status >= 500) {
        const error = new Error(`Server error (${response.status})`);
        console.warn(`Server error (${response.status}), retrying... (attempt ${attempt + 1}/${retries})`);
        onRetry?.(attempt + 1, retries, error);

        // Exponential backoff with jitter to avoid thundering herd
        const backoffMs = Math.pow(2, attempt + 1) * 1000 + Math.floor(Math.random() * 250);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Check if it was aborted due to timeout
      if (error.name === 'AbortError') {
        if (attempt < retries) {
          console.warn(`Request timeout, retrying... (attempt ${attempt + 1}/${retries})`);
          onRetry?.(attempt + 1, retries, error);

          // Wait before retry with exponential backoff and jitter
          const backoffMs = Math.pow(2, attempt + 1) * 1000 + Math.floor(Math.random() * 250);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        throw new TimeoutError('Request timed out. The server is taking longer than expected to respond. Please try again with a smaller request or check your connection.', { cause: error });
      }

      // For network errors, retry if attempts remain
      // TypeError is thrown by browsers on network failures
      if (attempt < retries && (
        error.name === 'TypeError' ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('Load failed')
      )) {
        console.warn(`Network error, retrying... (attempt ${attempt + 1}/${retries})`);
        onRetry?.(attempt + 1, retries, error);

        // Exponential backoff with jitter
        const backoffMs = Math.pow(2, attempt + 1) * 1000 + Math.floor(Math.random() * 250);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Failed to connect to server after multiple attempts');
}

/**
 * Generates a stable, deterministic idempotency key for lesson generation requests
 * This prevents duplicate lessons when retries occur after server processing
 * Keys are based only on stable identifiers: lessonDate, timeSlot, and sorted student IDs
 */
export function generateLessonIdempotencyKey(body: any): string {
  // For batch requests
  if (body.batch && Array.isArray(body.batch)) {
    const batchIds = body.batch.map((item: any) => {
      const studentIds = (item.students || [])
        .map((s: any) => s.id || s.studentId)
        .filter(Boolean)
        .sort()
        .join('-');
      // Use stable placeholders: 'nd' for no date, 'ot' for no time slot
      return `${item.lessonDate || 'nd'}-${item.timeSlot || 'ot'}-${studentIds}`;
    }).join('_');
    return `batch:${batchIds}`;
  }

  // For single requests
  const studentIds = (body.students || [])
    .map((s: any) => s.id || s.studentId)
    .filter(Boolean)
    .sort()
    .join('-');
  // Use stable placeholders: 'nd' for no date, 'od' for on-demand (no time slot)
  const lessonDate = body.lessonDate || 'nd';
  const timeSlot = body.timeSlot || 'od';

  return `single:${lessonDate}:${timeSlot}:${studentIds}`;
}

/**
 * Normalizes headers from various formats to a plain object
 * Handles Headers API instances, plain objects, and undefined
 */
function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (!headers) {
    return normalized;
  }

  // Handle Headers instance
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }

  // Handle arrays of [key, value] pairs
  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      if (key && value) {
        normalized[key] = value;
      }
    });
    return normalized;
  }

  // Handle plain objects (including objects with get/forEach methods)
  if (typeof headers === 'object') {
    // Check if it has Headers-like methods
    if ('forEach' in headers && typeof headers.forEach === 'function') {
      (headers as any).forEach((value: string, key: string) => {
        normalized[key] = value;
      });
      return normalized;
    }

    // Plain object - copy properties
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) {
        normalized[key] = String(value);
      }
    }
  }

  return normalized;
}

/**
 * Specific helper for AI lesson generation requests
 * Includes appropriate timeouts, error handling for OpenAI API calls,
 * and automatic idempotency key generation
 */
export async function fetchLessonGeneration(
  body: any,
  options: Omit<FetchWithRetryOptions, 'method' | 'body'> = {}
): Promise<Response> {
  // Normalize headers to plain object for safe manipulation
  const normalizedHeaders = normalizeHeaders(options.headers);

  // Add idempotency key if not already present
  if (!normalizedHeaders['Idempotency-Key'] && !normalizedHeaders['idempotency-key']) {
    normalizedHeaders['Idempotency-Key'] = generateLessonIdempotencyKey(body);
  }

  // Merge headers with defaults, preserving any custom headers
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...normalizedHeaders
  };

  return fetchWithRetry('/api/lessons/generate', {
    ...options,
    method: 'POST',
    headers: finalHeaders,
    body: JSON.stringify(body),
    timeout: options.timeout || 115000, // 115 seconds for lesson generation
    retries: options.retries ?? 2,
  });
}