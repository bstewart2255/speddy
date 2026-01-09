/**
 * Speddy Chrome Extension - Service Worker
 * Handles background tasks and passive discrepancy detection
 */

// API endpoint
const API_BASE_URL = 'https://speddy.xyz';

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Speddy extension installed', details.reason);

  if (details.reason === 'install') {
    // First install - initialize storage
    console.log('First install of Speddy extension');
    chrome.storage.local.set({ discrepancies: {} });
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'validateApiKey') {
    validateApiKey(request.apiKey)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // Handle passive extraction from content script
  if (request.action === 'passiveExtraction') {
    handlePassiveExtraction(request.student, request.pageType, request.url)
      .then(sendResponse)
      .catch(err => {
        console.error('Passive extraction error:', err);
        sendResponse({ error: err.message });
      });
    return true;
  }

  // Get stored discrepancies
  if (request.action === 'getDiscrepancies') {
    getStoredDiscrepancies()
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // Clear discrepancies (optionally for a specific student)
  if (request.action === 'clearDiscrepancies') {
    clearDiscrepancies(request.studentKey)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

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

// ==========================================
// PASSIVE MODE: Background Discrepancy Detection
// ==========================================

/**
 * Handle passive extraction from content script
 * Compare with Speddy data and store discrepancies
 */
async function handlePassiveExtraction(student, pageType, url) {
  const { apiKey } = await chrome.storage.local.get('apiKey');

  // Can't do passive checking without API key
  if (!apiKey) {
    return { skipped: true, reason: 'No API key' };
  }

  try {
    // Call compare endpoint
    const response = await fetch(`${API_BASE_URL}/api/extension/compare`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Compare API error:', error);
      return { error: error.error };
    }

    const result = await response.json();

    // If matched and has discrepancies, store them
    if (result.matched && result.hasDiscrepancies) {
      await storeDiscrepancy(student, result, url);
    }

    return result;
  } catch (err) {
    console.error('Passive extraction error:', err);
    return { error: err.message };
  }
}

/**
 * Store a discrepancy and update badge
 */
async function storeDiscrepancy(student, compareResult, url) {
  const { discrepancies = {} } = await chrome.storage.local.get('discrepancies');

  // Key by student name or SEIS ID
  const studentKey = student.seisId || student.name || 'unknown';

  discrepancies[studentKey] = {
    student: {
      name: student.name,
      seisId: student.seisId,
      grade: student.grade,
      school: student.school,
    },
    speddyStudent: compareResult.speddyStudent,
    discrepancies: compareResult.discrepancies,
    detectedAt: new Date().toISOString(),
    url,
  };

  await chrome.storage.local.set({ discrepancies });

  // Update badge
  await updateBadge();
}

/**
 * Get all stored discrepancies
 */
async function getStoredDiscrepancies() {
  const { discrepancies = {} } = await chrome.storage.local.get('discrepancies');
  return { discrepancies };
}

/**
 * Clear stored discrepancies
 * @param {string} [studentKey] - Optional key to clear only one student's discrepancy
 *                                If not provided, clears all discrepancies
 */
async function clearDiscrepancies(studentKey) {
  if (studentKey) {
    // Clear only the specified student's discrepancy
    const { discrepancies = {} } = await chrome.storage.local.get('discrepancies');
    delete discrepancies[studentKey];
    await chrome.storage.local.set({ discrepancies });
  } else {
    // Clear all discrepancies
    await chrome.storage.local.set({ discrepancies: {} });
  }
  await updateBadge();
  return { success: true };
}

/**
 * Update the extension badge with discrepancy count
 */
async function updateBadge() {
  const { discrepancies = {} } = await chrome.storage.local.get('discrepancies');
  const count = Object.keys(discrepancies).length;

  if (count > 0) {
    // Show count on badge
    await chrome.action.setBadgeText({ text: count.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Amber/warning color
  } else {
    // Clear badge
    await chrome.action.setBadgeText({ text: '' });
  }
}

// Initialize badge on startup
updateBadge();

// Log that service worker started
console.log('Speddy service worker started');
