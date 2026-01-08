/**
 * Speddy Chrome Extension - Popup Script
 * Handles UI state and user interactions for dual-mode sync
 */

// API endpoint (change for production)
const API_BASE_URL = 'https://app.tryspeddy.com';

// State elements
const states = {
  setup: document.getElementById('setup-state'),
  ready: document.getElementById('ready-state'),
  notSeis: document.getElementById('not-seis-state'),
  matchConfirm: document.getElementById('match-confirm-state'),
  dataSelect: document.getElementById('data-select-state'),
  discrepancies: document.getElementById('discrepancies-state'),
  loading: document.getElementById('loading-state'),
  success: document.getElementById('success-state'),
  error: document.getElementById('error-state'),
};

// Current session data
let currentTab = null;
let extractedData = null;
let compareResult = null;
let confirmedSpeddyStudentId = null;

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
  if (!url) return false;
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    return hostname === 'seis.org' || hostname.endsWith('.seis.org');
  } catch {
    return false;
  }
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
  currentTab = await getCurrentTab();

  if (!isSEISUrl(currentTab?.url)) {
    showState('notSeis');
    await checkAndShowDiscrepancies('alt');
    setupDisconnectListeners();
    return;
  }

  // On SEIS with API key - show ready state
  showState('ready');
  await setupReadyState(currentTab);
  await checkAndShowDiscrepancies('');
  setupDisconnectListeners();
}

// Check for and show discrepancies from passive mode
async function checkAndShowDiscrepancies(suffix) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getDiscrepancies' });
    const discrepancies = response?.discrepancies || {};
    const count = Object.keys(discrepancies).length;

    const alertEl = document.getElementById(`discrepancies-alert${suffix ? '-' + suffix : ''}`);
    const countEl = document.getElementById(`discrepancies-count${suffix ? '-' + suffix : ''}`);

    if (count > 0 && alertEl && countEl) {
      countEl.textContent = `${count} student${count > 1 ? 's' : ''}`;
      alertEl.classList.remove('hidden');

      // Setup view button
      const viewBtn = document.getElementById(`view-discrepancies-btn${suffix ? '-' + suffix : ''}`);
      viewBtn?.addEventListener('click', () => showDiscrepanciesState(discrepancies));

      // Setup dismiss button (only in main view)
      const dismissBtn = document.getElementById('dismiss-discrepancies-btn');
      dismissBtn?.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'clearDiscrepancies' });
        alertEl.classList.add('hidden');
      });
    }
  } catch (err) {
    console.error('Error checking discrepancies:', err);
  }
}

// Show discrepancies list state
function showDiscrepanciesState(discrepancies) {
  const listEl = document.getElementById('discrepancies-list');
  listEl.innerHTML = '';

  Object.entries(discrepancies).forEach(([key, data]) => {
    const item = document.createElement('div');
    item.className = 'discrepancy-item';

    const discrepancyLabels = [];
    if (data.discrepancies?.goals?.hasDifferences) discrepancyLabels.push('Goals');
    if (data.discrepancies?.services?.hasDifferences) discrepancyLabels.push('Services');
    if (data.discrepancies?.iepDate?.hasDifferences) discrepancyLabels.push('IEP Date');
    if (data.discrepancies?.accommodations?.hasDifferences) discrepancyLabels.push('Accommodations');

    item.innerHTML = `
      <div class="discrepancy-header">
        <strong>${data.student.name || key}</strong>
        <span class="discrepancy-grade">${data.student.grade || ''}</span>
      </div>
      <div class="discrepancy-details">
        <span class="discrepancy-label">Outdated:</span> ${discrepancyLabels.join(', ')}
      </div>
      <a href="${data.url}" target="_blank" class="discrepancy-link">Open in SEIS</a>
    `;

    listEl.appendChild(item);
  });

  // Setup back button
  document.getElementById('back-from-discrepancies-btn')?.addEventListener('click', () => {
    init(); // Re-initialize to go back to appropriate state
  });

  // Setup clear all button
  document.getElementById('clear-all-discrepancies-btn')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'clearDiscrepancies' });
    init();
  });

  showState('discrepancies');
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

// Handle extract button click - now goes to match confirmation first
async function handleExtract(tab, pageType) {
  showState('loading');
  document.getElementById('loading-message').textContent = 'Extracting data from SEIS...';

  try {
    // Send message to content script to extract data
    extractedData = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractData',
      pageType,
    });

    if (!extractedData || extractedData.error) {
      throw new Error(extractedData?.error || 'Failed to extract data');
    }

    document.getElementById('loading-message').textContent = 'Finding matching student...';

    // Compare with Speddy to find matched student
    compareResult = await chrome.runtime.sendMessage({
      action: 'compareStudent',
      student: extractedData.student,
    });

    // Show match confirmation state
    showMatchConfirmState();

  } catch (err) {
    console.error('Extract error:', err);
    showState('error');
    document.getElementById('error-message').textContent = err.message;

    document.getElementById('retry-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

// Show match confirmation state
function showMatchConfirmState() {
  const student = extractedData?.student;
  const speddyStudent = compareResult?.speddyStudent;

  // Populate SEIS student info
  document.getElementById('seis-student-name').textContent = student?.name || '-';
  document.getElementById('seis-student-grade').textContent = student?.grade || '-';
  document.getElementById('seis-student-school').textContent = student?.school || '-';

  // Populate Speddy student info (or show warning)
  const speddyInfoEl = document.getElementById('speddy-student-info');
  const noMatchEl = document.getElementById('no-match-warning');

  if (speddyStudent) {
    speddyInfoEl.classList.remove('hidden');
    noMatchEl.classList.add('hidden');
    document.getElementById('speddy-student-initials').textContent = speddyStudent.initials || '-';
    document.getElementById('speddy-student-grade').textContent = speddyStudent.grade || '-';
    document.getElementById('speddy-student-school').textContent = speddyStudent.school || '-';
    confirmedSpeddyStudentId = speddyStudent.id;
  } else {
    speddyInfoEl.classList.add('hidden');
    noMatchEl.classList.remove('hidden');
    confirmedSpeddyStudentId = null;
  }

  // Setup confirm checkbox
  const confirmCheckbox = document.getElementById('confirm-match-checkbox');
  const proceedBtn = document.getElementById('proceed-match-btn');

  confirmCheckbox.checked = false;
  proceedBtn.disabled = true;

  confirmCheckbox?.addEventListener('change', () => {
    proceedBtn.disabled = !confirmCheckbox.checked || !speddyStudent;
  });

  // Setup cancel button
  document.getElementById('cancel-match-btn')?.addEventListener('click', () => {
    init();
  });

  // Setup proceed button
  proceedBtn?.addEventListener('click', () => {
    showDataSelectState();
  });

  showState('matchConfirm');
}

// Show data selection state
function showDataSelectState() {
  const student = extractedData?.student;

  // Goals
  const goalsCount = student?.goals?.length || 0;
  document.getElementById('goals-count').textContent = goalsCount;

  if (goalsCount > 0) {
    document.getElementById('goals-section').classList.remove('hidden');
    populateGoalsPreview(student.goals);
  } else {
    document.getElementById('goals-section').classList.add('hidden');
  }

  // Services
  if (student?.services?.length > 0) {
    document.getElementById('services-section').classList.remove('hidden');
    const primaryService = student.services[0];
    document.getElementById('services-details').textContent =
      `${primaryService.code} ${primaryService.name}: ${primaryService.minutesPerSession} min x ${primaryService.sessionsPerPeriod}/week`;
  } else {
    document.getElementById('services-section').classList.add('hidden');
  }

  // IEP Dates
  if (student?.futureIepDate || student?.currentIepDate) {
    document.getElementById('dates-section').classList.remove('hidden');
    const dateText = student.futureIepDate
      ? `Next IEP: ${student.futureIepDate}`
      : `Current IEP: ${student.currentIepDate}`;
    document.getElementById('dates-details').textContent = dateText;
  } else {
    document.getElementById('dates-section').classList.add('hidden');
  }

  // Accommodations
  const accCount = student?.accommodations?.length || 0;
  document.getElementById('accommodations-count').textContent = accCount;
  if (accCount > 0) {
    document.getElementById('accommodations-section').classList.remove('hidden');
  } else {
    document.getElementById('accommodations-section').classList.add('hidden');
  }

  // Setup toggle goals preview button
  const toggleBtn = document.getElementById('toggle-goals-preview');
  const goalsPreview = document.getElementById('goals-preview');

  toggleBtn?.addEventListener('click', () => {
    const isHidden = goalsPreview.classList.toggle('hidden');
    toggleBtn.textContent = isHidden ? 'Show preview' : 'Hide preview';
  });

  // Setup back button
  document.getElementById('back-to-match-btn')?.addEventListener('click', () => {
    showMatchConfirmState();
  });

  // Setup sync button
  document.getElementById('sync-btn')?.addEventListener('click', handleSync);

  showState('dataSelect');
}

// Populate goals preview
function populateGoalsPreview(goals) {
  const previewEl = document.getElementById('goals-preview');
  const scrollEl = previewEl?.querySelector('.preview-scroll');

  if (!scrollEl) return;

  scrollEl.innerHTML = '';

  goals.forEach((goal, index) => {
    const goalEl = document.createElement('div');
    goalEl.className = 'goal-preview-item';
    goalEl.innerHTML = `
      <div class="goal-header">Goal ${index + 1}: ${goal.areaOfNeed || 'Unknown Area'}</div>
      <div class="goal-text">${goal.goalText.substring(0, 200)}${goal.goalText.length > 200 ? '...' : ''}</div>
    `;
    scrollEl.appendChild(goalEl);
  });
}

// Handle sync button click
async function handleSync() {
  showState('loading');
  document.getElementById('loading-message').textContent = 'Syncing to Speddy...';

  try {
    // Build payload based on selected options
    const student = { ...extractedData.student };

    // Filter based on checkboxes
    if (!document.getElementById('import-goals')?.checked) {
      delete student.goals;
    }
    if (!document.getElementById('import-services')?.checked) {
      delete student.services;
    }
    if (!document.getElementById('import-dates')?.checked) {
      delete student.futureIepDate;
      delete student.currentIepDate;
    }
    if (!document.getElementById('import-accommodations')?.checked) {
      delete student.accommodations;
    }

    const { apiKey } = await chrome.storage.local.get('apiKey');

    const response = await fetch(`${API_BASE_URL}/api/extension/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        students: [student],
        source: 'seis',
        pageType: extractedData.student.goals?.length ? 'goals' : 'services',
        speddyStudentId: confirmedSpeddyStudentId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Import failed');
    }

    const result = await response.json();

    // Clear any discrepancy for this student (it's now synced)
    await chrome.runtime.sendMessage({ action: 'clearDiscrepancies' });

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
    console.error('Sync error:', err);
    showState('error');
    document.getElementById('error-message').textContent = err.message;

    document.getElementById('retry-btn')?.addEventListener('click', () => {
      showDataSelectState();
    });
  }
}

// Setup disconnect listeners
function setupDisconnectListeners() {
  const disconnectBtns = document.querySelectorAll('#disconnect-btn, #disconnect-btn-alt');
  disconnectBtns.forEach(btn => {
    btn?.addEventListener('click', async () => {
      await chrome.storage.local.remove('apiKey');
      await chrome.runtime.sendMessage({ action: 'clearDiscrepancies' });
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
