/**
 * Speddy Chrome Extension - Service Worker
 * Handles background tasks and API communication
 */

// API endpoint (change for production)
const API_BASE_URL = 'https://app.tryspeddy.com';

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Speddy extension installed', details.reason);

  if (details.reason === 'install') {
    // First install - could show welcome page
    console.log('First install of Speddy extension');
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToSpeddy') {
    handleSendToSpeddy(request.data)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'validateApiKey') {
    validateApiKey(request.apiKey)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

/**
 * Send extracted data to Speddy API
 */
async function handleSendToSpeddy(data) {
  const { apiKey } = await chrome.storage.local.get('apiKey');

  if (!apiKey) {
    throw new Error('No API key configured');
  }

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
 * Validate an API key by making a test request
 */
async function validateApiKey(apiKey) {
  // For now, we just check the format
  // A proper validation would make a request to a validation endpoint
  if (!apiKey || !apiKey.startsWith('sk_live_')) {
    return { valid: false, error: 'Invalid API key format' };
  }

  return { valid: true };
}

// Log that service worker started
console.log('Speddy service worker started');
