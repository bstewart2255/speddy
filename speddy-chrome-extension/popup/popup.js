/**
 * Speddy Chrome Extension - Popup Script
 * Handles UI for silent discrepancy detection mode
 */

// State elements
const states = {
  setup: document.getElementById('setup-state'),
  main: document.getElementById('main-state'),
};

// AbortController for cleaning up event listeners between state transitions
let currentAbortController = null;

/**
 * Get an AbortSignal for the current state.
 * Call this at the start of any function that adds event listeners.
 * Previous listeners will be automatically removed when state changes.
 */
function getStateSignal() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  return currentAbortController.signal;
}

// Show a specific state, hide others
function showState(stateName) {
  Object.entries(states).forEach(([name, element]) => {
    if (element) {
      element.classList.toggle('hidden', name !== stateName);
    }
  });
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

  // Has API key - show main state with discrepancies
  showState('main');
  const signal = getStateSignal();
  await loadDiscrepancies(signal);
  setupDisconnectListener(signal);
}

// Load and display discrepancies
async function loadDiscrepancies(signal) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getDiscrepancies' });
    const discrepancies = response?.discrepancies || {};
    const count = Object.keys(discrepancies).length;

    const noDiscrepanciesEl = document.getElementById('no-discrepancies');
    const discrepanciesSectionEl = document.getElementById('discrepancies-section');
    const listEl = document.getElementById('discrepancies-list');

    if (count === 0) {
      noDiscrepanciesEl.classList.remove('hidden');
      discrepanciesSectionEl.classList.add('hidden');
    } else {
      noDiscrepanciesEl.classList.add('hidden');
      discrepanciesSectionEl.classList.remove('hidden');
      renderDiscrepancyItems(discrepancies, listEl, signal);
      setupClearAllListener(signal);
    }
  } catch (err) {
    console.error('Error loading discrepancies:', err);
  }
}

// Render discrepancy items to the list
function renderDiscrepancyItems(discrepancies, container, signal) {
  container.innerHTML = '';

  Object.entries(discrepancies).forEach(([key, data]) => {
    const item = document.createElement('div');
    item.className = 'discrepancy-item';

    const discrepancyLabels = [];
    if (data.discrepancies?.goals?.hasDifferences) discrepancyLabels.push('Goals');
    if (data.discrepancies?.services?.hasDifferences) discrepancyLabels.push('Services');
    if (data.discrepancies?.iepDate?.hasDifferences) discrepancyLabels.push('IEP Date');
    if (data.discrepancies?.accommodations?.hasDifferences) discrepancyLabels.push('Accommodations');

    // Create elements safely using textContent to prevent XSS
    const headerEl = document.createElement('div');
    headerEl.className = 'discrepancy-header';

    const nameEl = document.createElement('strong');
    nameEl.textContent = data.student.name || key;
    headerEl.appendChild(nameEl);

    const gradeEl = document.createElement('span');
    gradeEl.className = 'discrepancy-grade';
    gradeEl.textContent = data.student.grade || '';
    headerEl.appendChild(gradeEl);

    const detailsEl = document.createElement('div');
    detailsEl.className = 'discrepancy-details';

    const labelEl = document.createElement('span');
    labelEl.className = 'discrepancy-label';
    labelEl.textContent = 'Outdated: ';
    detailsEl.appendChild(labelEl);
    detailsEl.appendChild(document.createTextNode(discrepancyLabels.join(', ')));

    const actionsEl = document.createElement('div');
    actionsEl.className = 'discrepancy-actions';

    const linkEl = document.createElement('a');
    linkEl.href = data.url;
    linkEl.target = '_blank';
    linkEl.className = 'discrepancy-link';
    linkEl.textContent = 'Open in SEIS';
    actionsEl.appendChild(linkEl);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-link btn-small';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ action: 'clearDiscrepancies', studentKey: key });
      init(); // Refresh the view
    }, { signal });
    actionsEl.appendChild(clearBtn);

    item.appendChild(headerEl);
    item.appendChild(detailsEl);
    item.appendChild(actionsEl);

    container.appendChild(item);
  });
}

// Setup clear all button listener
function setupClearAllListener(signal) {
  document.getElementById('clear-all-btn')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'clearDiscrepancies' });
    init(); // Refresh the view
  }, { signal });
}

// Setup state listeners
function setupSetupListeners() {
  const signal = getStateSignal();
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

    saveBtn.disabled = true;
    saveBtn.textContent = 'Validating...';

    try {
      await chrome.storage.local.set({ apiKey });
      window.location.reload();
    } catch (err) {
      showError(errorEl, 'Failed to save API key');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Key';
    }
  }, { signal });
}

// Setup disconnect listener
function setupDisconnectListener(signal) {
  document.getElementById('disconnect-btn')?.addEventListener('click', async () => {
    await chrome.storage.local.remove('apiKey');
    await chrome.runtime.sendMessage({ action: 'clearDiscrepancies' });
    window.location.reload();
  }, { signal });
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
