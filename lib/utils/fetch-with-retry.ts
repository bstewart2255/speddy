/**
 * Utility function to fetch with timeout and retry logic
 * Designed to handle network issues and timeouts in production environments
 */

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

        // Exponential backoff: 2s, 4s, 8s...
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
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

          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
          continue;
        }
        throw new Error('Request timed out. The server is taking longer than expected to respond. Please try again with a smaller request or check your connection.');
      }

      // For network errors, retry if attempts remain
      if (attempt < retries && (
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('Load failed')
      )) {
        console.warn(`Network error, retrying... (attempt ${attempt + 1}/${retries})`);
        onRetry?.(attempt + 1, retries, error);

        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Failed to connect to server after multiple attempts');
}

/**
 * Specific helper for AI lesson generation requests
 * Includes appropriate timeouts and error handling for OpenAI API calls
 */
export async function fetchLessonGeneration(
  body: any,
  options: Omit<FetchWithRetryOptions, 'method' | 'headers' | 'body'> = {}
): Promise<Response> {
  return fetchWithRetry('/api/lessons/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeout: 115000, // 115 seconds for lesson generation
    retries: 2,
    ...options
  });
}