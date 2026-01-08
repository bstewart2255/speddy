/**
 * Speddy API Client
 * Handles communication with Speddy backend
 */

// API endpoint - update for production
const API_BASE_URL = 'https://speddy.xyz';

/**
 * Send extracted data to Speddy
 */
export async function sendToSpeddy(apiKey, data) {
  const response = await fetch(`${API_BASE_URL}/api/extension/import`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    // Handle non-JSON error responses gracefully
    let errorMessage = `Import failed (HTTP ${response.status})`;
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      // Response wasn't JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Validate API key
 */
export async function validateApiKey(apiKey) {
  if (!apiKey || !apiKey.startsWith('sk_live_')) {
    return { valid: false, error: 'Invalid API key format' };
  }

  // Could make a test request here
  return { valid: true };
}
