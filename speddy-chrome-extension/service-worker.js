/**
 * Speddy Chrome Extension - Service Worker
 * Handles background tasks and passive discrepancy detection
 */

// API endpoint
const API_BASE_URL = 'https://speddy.xyz';

// SPE-143: bound the on-device cache of student data (SEIS ID, name, grade,
// school) so backend deletion/retention isn't undermined by stale local copies.
// Cached discrepancies expire after this TTL, and the cache is cleared on logout
// (manual disconnect, or an invalidated API key — see handlePassiveExtraction).
const DISCREPANCY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PRUNE_ALARM_NAME = 'prune-discrepancies';

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

    // Clear-on-logout: if the API key has been revoked/invalidated server-side,
    // treat it as a logout — drop the key and wipe the on-device student cache so
    // it can't linger after backend access is gone.
    if (response.status === 401 || response.status === 403) {
      await chrome.storage.local.remove('apiKey');
      await clearDiscrepancies();
      console.warn('API key invalid — disconnected and cleared local cache');
      return { error: 'API key invalid — disconnected' };
    }

    if (!response.ok) {
      let errorMessage = 'Compare API error';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch {
        errorMessage = `HTTP ${response.status}`;
      }
      console.error('Compare API error:', errorMessage);
      return { error: errorMessage };
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

  // Key by student name or SEIS ID - skip if neither available
  const studentKey = student.seisId || student.name;
  if (!studentKey) {
    console.warn('Cannot store discrepancy: student has no seisId or name');
    return;
  }

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
 * Drop cached discrepancies older than the TTL. Returns the surviving set.
 * Persists only when something was actually removed.
 */
async function pruneExpiredDiscrepancies() {
  const { discrepancies = {} } = await chrome.storage.local.get('discrepancies');
  const now = Date.now();
  let changed = false;

  for (const [key, entry] of Object.entries(discrepancies)) {
    const detectedAt = entry?.detectedAt ? Date.parse(entry.detectedAt) : NaN;
    if (Number.isNaN(detectedAt) || now - detectedAt > DISCREPANCY_TTL_MS) {
      delete discrepancies[key];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ discrepancies });
  }
  return discrepancies;
}

/**
 * Get all stored discrepancies (expired entries are pruned first)
 */
async function getStoredDiscrepancies() {
  const discrepancies = await pruneExpiredDiscrepancies();
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
  const discrepancies = await pruneExpiredDiscrepancies();
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

// Periodically prune expired cached discrepancies (TTL enforcement), even when
// the popup is never opened.
chrome.alarms.create(PRUNE_ALARM_NAME, { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === PRUNE_ALARM_NAME) {
    await pruneExpiredDiscrepancies();
    await updateBadge();
  }
});

// Initialize badge on startup (also prunes expired entries)
updateBadge();

// Log that service worker started
console.log('Speddy service worker started');
