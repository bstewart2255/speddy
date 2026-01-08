/**
 * Speddy Chrome Extension - Service Worker
 * Handles background tasks, API communication, and passive discrepancy checking
 */

// API endpoint (change for production)
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

  // Handle compare request from popup
  if (request.action === 'compareStudent') {
    handleCompareStudent(request.student)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
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

  // Get user's students list (for student picker)
  if (request.action === 'getSpeddyStudents') {
    getSpeddyStudents()
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

// ==========================================
// PASSIVE MODE: Background Discrepancy Checking
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
 * Handle compare request from popup (for active mode preview)
 */
async function handleCompareStudent(student) {
  const { apiKey } = await chrome.storage.local.get('apiKey');

  if (!apiKey) {
    throw new Error('No API key configured');
  }

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
    throw new Error(error.error || 'Compare failed');
  }

  return response.json();
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

/**
 * Get user's students from Speddy (for student picker in popup)
 * This uses the compare endpoint with a dummy student to get back matched students
 */
async function getSpeddyStudents() {
  const { apiKey } = await chrome.storage.local.get('apiKey');

  if (!apiKey) {
    throw new Error('No API key configured');
  }

  // We need a new endpoint for this, or we can use a hack:
  // For now, we'll just return an indication that the endpoint isn't available
  // TODO: Add a /api/extension/students endpoint to list user's students

  return {
    error: 'Students list endpoint not yet implemented',
    hint: 'Use the matched student from compare result instead',
  };
}

// Initialize badge on startup
updateBadge();

// Log that service worker started
console.log('Speddy service worker started');
