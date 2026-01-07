/**
 * Speddy Chrome Extension - Popup Script
 * Handles UI state and user interactions
 */

// API endpoint (change for production)
const API_BASE_URL = 'https://app.tryspeddy.com';

// State elements
const states = {
  setup: document.getElementById('setup-state'),
  ready: document.getElementById('ready-state'),
  notSeis: document.getElementById('not-seis-state'),
  loading: document.getElementById('loading-state'),
  success: document.getElementById('success-state'),
  error: document.getElementById('error-state'),
};

// Show a specific state, hide others
function showState(stateName) {
  Object.entries(states).forEach(([name, element]) => {
    if (element) {
      element.classList.toggle('hidden', name !== stateName);
    }
  });
}

// Check if current tab is on SEIS
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSEISUrl(url) {
  return url && (url.includes('seis.org'));
}

// Detect SEIS page type from URL
function detectPageType(url) {
  if (!url) return { type: 'unknown', badge: 'Unknown Page', description: 'Navigate to a SEIS page.' };

  if (url.includes('/state/goals')) {
    return {
      type: 'goals',
      badge: 'Goals Page',
      badgeClass: 'badge-goals',
      description: 'Extract IEP goals and student info from this page.',
    };
  }

  if (url.includes('/state/services')) {
    return {
      type: 'services',
      badge: 'Services Page',
      badgeClass: 'badge-services',
      description: 'Extract services and accommodations from this page.',
    };
  }

  if (url.includes('/iep')) {
    return {
      type: 'student-list',
      badge: 'Student List',
      badgeClass: 'badge-students',
      description: 'View your caseload. Click a student to access their IEP.',
    };
  }

  return {
    type: 'unknown',
    badge: 'SEIS Page',
    description: 'Navigate to Goals or Services page to extract data.',
  };
}

// Initialize popup
async function init() {
  // Check for saved API key
  const { apiKey } = await chrome.storage.local.get('apiKey');

  if (!apiKey) {
    showState('setup');
    setupSetupListeners();
    return;
  }

  // Check if on SEIS
  const tab = await getCurrentTab();

  if (!isSEISUrl(tab?.url)) {
    showState('notSeis');
    setupDisconnectListeners();
    return;
  }

  // On SEIS with API key - show ready state
  showState('ready');
  setupReadyState(tab);
  setupDisconnectListeners();
}

// Setup state listeners
function setupSetupListeners() {
  const saveBtn = document.getElementById('save-key-btn');
  const input = document.getElementById('api-key-input');
  const errorEl = document.getElementById('setup-error');

  saveBtn?.addEventListener('click', async () => {
    const apiKey = input?.value?.trim();

    if (!apiKey) {
      showError(errorEl, 'Please enter an API key');
      return;
    }

    if (!apiKey.startsWith('sk_live_')) {
      showError(errorEl, 'Invalid API key format. Keys start with sk_live_');
      return;
    }

    // Validate the key by making a test request
    saveBtn.disabled = true;
    saveBtn.textContent = 'Validating...';

    try {
      // For now, just save it - validation happens on first use
      await chrome.storage.local.set({ apiKey });

      // Refresh the popup
      window.location.reload();
    } catch (err) {
      showError(errorEl, 'Failed to save API key');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Key';
    }
  });
}

// Setup ready state
async function setupReadyState(tab) {
  const pageInfo = detectPageType(tab?.url);

  // Update badge
  const badge = document.getElementById('page-type-badge');
  if (badge) {
    badge.textContent = pageInfo.badge;
    badge.className = `badge ${pageInfo.badgeClass || ''}`;
  }

  // Update description
  const desc = document.getElementById('page-description');
  if (desc) {
    desc.textContent = pageInfo.description;
  }

  // Enable extract button for goals/services pages
  const extractBtn = document.getElementById('extract-btn');
  if (extractBtn) {
    const canExtract = ['goals', 'services'].includes(pageInfo.type);
    extractBtn.disabled = !canExtract;
    extractBtn.textContent = canExtract ? 'Extract & Import to Speddy' : 'Navigate to Goals or Services';

    if (canExtract) {
      extractBtn.addEventListener('click', () => handleExtract(tab, pageInfo.type));
    }
  }

  // Try to get preview data from content script
  if (['goals', 'services'].includes(pageInfo.type)) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPreview' });
      if (response?.preview) {
        showPreview(response.preview);
      }
    } catch (err) {
      // Content script may not be ready yet
      console.log('Could not get preview:', err);
    }
  }
}

// Show preview data
function showPreview(preview) {
  const previewEl = document.getElementById('extraction-preview');
  const listEl = document.getElementById('preview-list');

  if (!previewEl || !listEl) return;

  listEl.innerHTML = '';

  if (preview.studentName) {
    listEl.innerHTML += `<li><strong>Student:</strong> ${preview.studentName}</li>`;
  }
  if (preview.goalsCount !== undefined) {
    listEl.innerHTML += `<li><strong>Goals:</strong> ${preview.goalsCount} found</li>`;
  }
  if (preview.servicesCount !== undefined) {
    listEl.innerHTML += `<li><strong>Services:</strong> ${preview.servicesCount} found</li>`;
  }
  if (preview.accommodationsCount !== undefined) {
    listEl.innerHTML += `<li><strong>Accommodations:</strong> ${preview.accommodationsCount} found</li>`;
  }

  previewEl.classList.remove('hidden');
}

// Handle extract button click
async function handleExtract(tab, pageType) {
  showState('loading');
  document.getElementById('loading-message').textContent = 'Extracting data from SEIS...';

  try {
    // Send message to content script to extract data
    const extractedData = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractData',
      pageType,
    });

    if (!extractedData || extractedData.error) {
      throw new Error(extractedData?.error || 'Failed to extract data');
    }

    document.getElementById('loading-message').textContent = 'Sending to Speddy...';

    // Send to Speddy API
    const { apiKey } = await chrome.storage.local.get('apiKey');

    const response = await fetch(`${API_BASE_URL}/api/extension/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        students: [extractedData.student],
        source: 'seis',
        pageType,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Import failed');
    }

    const result = await response.json();

    // Show success
    showState('success');
    const details = document.getElementById('success-details');
    if (details) {
      details.innerHTML = `
        <p>Matched: ${result.results.matched} student(s)</p>
        <p>Updated: ${result.results.updated} record(s)</p>
      `;
    }

    document.getElementById('done-btn')?.addEventListener('click', () => {
      window.close();
    });

  } catch (err) {
    console.error('Extract error:', err);
    showState('error');
    document.getElementById('error-message').textContent = err.message;

    document.getElementById('retry-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

// Setup disconnect listeners
function setupDisconnectListeners() {
  const disconnectBtns = document.querySelectorAll('#disconnect-btn, #disconnect-btn-alt');
  disconnectBtns.forEach(btn => {
    btn?.addEventListener('click', async () => {
      await chrome.storage.local.remove('apiKey');
      window.location.reload();
    });
  });
}

// Show error message
function showError(element, message) {
  if (element) {
    element.textContent = message;
    element.classList.remove('hidden');
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
