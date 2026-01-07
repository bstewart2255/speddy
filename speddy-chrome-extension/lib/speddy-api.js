/**
 * Speddy API Client
 * Handles communication with Speddy backend
 */

// API endpoint - update for production
const API_BASE_URL = 'https://app.tryspeddy.com';

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
    const error = await response.json();
    throw new Error(error.error || 'Import failed');
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
