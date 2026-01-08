/**
 * Speddy Chrome Extension - SEIS Content Script
 * Extracts IEP data from SEIS pages
 */

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPreview') {
    const preview = getPagePreview();
    sendResponse({ preview });
    return true;
  }

  if (request.action === 'extractData') {
    const data = extractPageData(request.pageType);
    sendResponse(data);
    return true;
  }
});

/**
 * Get a quick preview of what's on the page
 */
function getPagePreview() {
  const url = window.location.href;

  if (url.includes('/state/goals')) {
    return getGoalsPreview();
  }

  if (url.includes('/state/services')) {
    return getServicesPreview();
  }

  return null;
}

/**
 * Extract full data from the page
 */
function extractPageData(pageType) {
  try {
    if (pageType === 'goals') {
      return extractGoalsPage();
    }

    if (pageType === 'services') {
      return extractServicesPage();
    }

    return { error: 'Unknown page type' };
  } catch (err) {
    console.error('Extraction error:', err);
    return { error: err.message };
  }
}

// ==========================================
// GOALS PAGE EXTRACTION
// ==========================================

function getGoalsPreview() {
  const studentInfo = extractStudentSidebar();
  const goals = document.querySelectorAll('[class*="goal"], .goal-container, [id*="goal"]');

  // Try to count goals from the page structure
  let goalsCount = goals.length;

  // If no goals found with those selectors, try looking for goal headers
  if (goalsCount === 0) {
    const goalHeaders = document.querySelectorAll('h3, h4, .panel-title');
    goalHeaders.forEach(header => {
      if (header.textContent?.toLowerCase().includes('goal')) {
        goalsCount++;
      }
    });
  }

  // Alternative: Count sections that look like goals
  if (goalsCount === 0) {
    const sections = document.querySelectorAll('.panel, .card, section');
    sections.forEach(section => {
      if (section.textContent?.includes('Area of Need') ||
          section.textContent?.includes('Measurable Annual Goal')) {
        goalsCount++;
      }
    });
  }

  return {
    studentName: studentInfo?.name || 'Unknown',
    goalsCount,
  };
}

function extractGoalsPage() {
  const studentInfo = extractStudentSidebar();
  const goals = extractGoals();

  return {
    student: {
      seisId: studentInfo?.seisId,
      ssid: studentInfo?.ssid,
      name: studentInfo?.name,
      firstName: studentInfo?.firstName,
      lastName: studentInfo?.lastName,
      grade: studentInfo?.grade,
      school: studentInfo?.school,
      caseManager: studentInfo?.caseManager,
      futureIepDate: studentInfo?.futureIepDate,
      currentIepDate: studentInfo?.currentIepDate,
      goals,
    },
  };
}

/**
 * Extract student info from the sidebar panel
 * Based on screenshot: Right panel contains Name, DOB, Grade, SEIS ID, etc.
 */
function extractStudentSidebar() {
  const info = {
    seisId: null,
    ssid: null,
    name: null,
    firstName: null,
    lastName: null,
    dob: null,
    grade: null,
    school: null,
    caseManager: null,
    futureIepDate: null,
    currentIepDate: null,
  };

  // Try to find the student info panel
  // Look for elements with labels like "Name:", "SEIS ID:", etc.
  const allText = document.body.innerText;

  // Extract using patterns from the sidebar
  const patterns = {
    name: /Name:\s*([^\n]+)/i,
    seisId: /SEIS ID:\s*(\d+)/i,
    ssid: /SSID:\s*(\d+)/i,
    dob: /DOB:\s*([^\n]+)/i,
    grade: /Grade:\s*([^\n]+)/i,
    school: /School:\s*([^\n]+)/i,
    caseManager: /Case Manager:\s*([^\n]+)/i,
    futureIepDate: /Future IEP Date:\s*([^\n]+)/i,
    currentIepDate: /Current IEP Date:\s*([^\n]+)/i,
  };

  // Alternative patterns for different label formats
  const altPatterns = {
    futureIepDate: /Next IEP:\s*([^\n]+)/i,
    currentIepDate: /IEP Date:\s*([^\n]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = allText.match(pattern);
    if (match) {
      info[key] = match[1].trim();
    }
  }

  // Try alternative patterns if main ones didn't match
  for (const [key, pattern] of Object.entries(altPatterns)) {
    if (!info[key]) {
      const match = allText.match(pattern);
      if (match) {
        info[key] = match[1].trim();
      }
    }
  }

  // Parse first/last name from full name
  if (info.name && !info.firstName) {
    const nameParts = info.name.split(/[,\s]+/).filter(Boolean);
    if (nameParts.length >= 2) {
      // Check if comma-separated (Last, First format)
      if (info.name.includes(',')) {
        info.lastName = nameParts[0];
        info.firstName = nameParts[1];
      } else {
        info.firstName = nameParts[0];
        info.lastName = nameParts[nameParts.length - 1];
      }
    }
  }

  return info;
}

/**
 * Extract IEP goals from the page
 */
function extractGoals() {
  const goals = [];

  // Strategy 1: Look for goal sections with specific structure
  // Based on screenshot: "Behavior Goal #1", "Area of Need", "Goal" text
  const goalSections = findGoalSections();

  for (const section of goalSections) {
    const goal = parseGoalSection(section);
    if (goal) {
      goals.push(goal);
    }
  }

  // Strategy 2: If no structured goals found, try to find goal text blocks
  if (goals.length === 0) {
    const goalBlocks = findGoalTextBlocks();
    for (const block of goalBlocks) {
      goals.push({
        areaOfNeed: 'Unknown',
        goalText: block,
        category: null,
      });
    }
  }

  return goals;
}

function findGoalSections() {
  const sections = [];

  // Look for panels/cards that contain goal information
  const panels = document.querySelectorAll('.panel, .card, [class*="goal"], section, div[ng-repeat]');

  for (const panel of panels) {
    const text = panel.textContent || '';

    // Check if this looks like a goal section
    if (
      (text.includes('Goal') && text.includes('Area of Need')) ||
      text.includes('Measurable Annual Goal') ||
      text.includes('By ') && text.includes('will ') // Common IEP goal format
    ) {
      sections.push(panel);
    }
  }

  return sections;
}

function parseGoalSection(section) {
  const text = section.textContent || '';

  // Extract area of need
  let areaOfNeed = null;
  const areaMatch = text.match(/Area of Need[:\s]*([^\n]+)/i);
  if (areaMatch) {
    areaOfNeed = areaMatch[1].trim();
  }

  // Extract the goal text (usually the longest paragraph starting with "By")
  let goalText = null;

  // Look for the goal label and text
  const goalLabel = section.querySelector('[class*="goal-text"], .goal-description, p');
  if (goalLabel) {
    const labelText = goalLabel.textContent || '';
    if (labelText.includes('By ') && labelText.includes('will ')) {
      goalText = labelText.trim();
    }
  }

  // Fallback: Find text that looks like an IEP goal
  if (!goalText) {
    const goalMatch = text.match(/By\s+[\w\s,]+\d{4}[^.]+will[^.]+\./gi);
    if (goalMatch && goalMatch.length > 0) {
      goalText = goalMatch[0].trim();
    }
  }

  // Extract category
  let category = null;
  const catMatch = text.match(/Measurable Annual Goal[:\s#]*([^\n]+)/i);
  if (catMatch) {
    category = catMatch[1].trim();
  }

  if (goalText) {
    return {
      areaOfNeed: areaOfNeed || 'Unknown',
      goalText,
      category,
    };
  }

  return null;
}

function findGoalTextBlocks() {
  const goalTexts = [];
  const textElements = document.querySelectorAll('p, div, span, td');

  for (const el of textElements) {
    const text = el.textContent || '';

    // IEP goals typically follow this pattern
    if (
      text.length > 100 &&
      text.includes('By ') &&
      text.includes('will ') &&
      (text.includes('as measured') || text.includes('accuracy') || text.includes('%'))
    ) {
      // Avoid duplicates
      if (!goalTexts.some(g => g.includes(text.substring(0, 50)))) {
        goalTexts.push(text.trim());
      }
    }
  }

  return goalTexts;
}

// ==========================================
// SERVICES PAGE EXTRACTION
// ==========================================

function getServicesPreview() {
  const studentInfo = extractStudentSidebar();
  const services = document.querySelectorAll('[class*="service"], .service-row, tr[ng-repeat]');
  const accommodations = document.querySelectorAll('[class*="accommodation"], .accommodation-row');

  // Count services by looking for service patterns
  let servicesCount = 0;
  let accommodationsCount = 0;

  // Try to count from table rows or sections
  const allText = document.body.innerText;
  const serviceMatches = allText.match(/\d+\s+\w+.*min\s*x\s*\d+\s*sessions/gi);
  if (serviceMatches) {
    servicesCount = serviceMatches.length;
  }

  // Count accommodation sections
  const accText = allText.match(/Program Accommodations/gi);
  if (accText) {
    accommodationsCount = 1; // At least one accommodation section
  }

  return {
    studentName: studentInfo?.name || 'Unknown',
    servicesCount: servicesCount || services.length,
    accommodationsCount: accommodationsCount || accommodations.length,
  };
}

function extractServicesPage() {
  const studentInfo = extractStudentSidebar();
  const services = extractServices();
  const accommodations = extractAccommodations();

  return {
    student: {
      seisId: studentInfo?.seisId,
      ssid: studentInfo?.ssid,
      name: studentInfo?.name,
      firstName: studentInfo?.firstName,
      lastName: studentInfo?.lastName,
      grade: studentInfo?.grade,
      school: studentInfo?.school,
      services,
      accommodations,
    },
  };
}

/**
 * Extract services from the page
 * Based on screenshot: Service code, name, dates, duration/frequency
 */
function extractServices() {
  const services = [];
  const allText = document.body.innerText;

  // Pattern: "#1 510 Individual counseling" or similar
  // Duration: "45 min x 1 sessions = 45 min Weekly"
  const serviceBlocks = allText.split(/(?=#\d+\s+\d{3})/);

  for (const block of serviceBlocks) {
    const service = parseServiceBlock(block);
    if (service) {
      services.push(service);
    }
  }

  // Alternative: Look for service rows in tables
  if (services.length === 0) {
    const rows = document.querySelectorAll('tr, .service-item, [class*="service"]');
    for (const row of rows) {
      const text = row.textContent || '';
      if (text.match(/\d{3}\s+\w+/) && text.includes('min')) {
        const service = parseServiceBlock(text);
        if (service) {
          services.push(service);
        }
      }
    }
  }

  return services;
}

function parseServiceBlock(block) {
  // Extract service code and name: "510 Individual counseling"
  const codeMatch = block.match(/(\d{3})\s+([A-Za-z\s]+?)(?=Dates|Duration|\n)/);
  if (!codeMatch) return null;

  const code = codeMatch[1];
  const name = codeMatch[2].trim();

  // Extract dates: "02/06/2025 - 02/05/2026"
  const datesMatch = block.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  const startDate = datesMatch ? datesMatch[1] : null;
  const endDate = datesMatch ? datesMatch[2] : null;

  // Extract duration: "45 min x 1 sessions = 45 min Weekly"
  const durationMatch = block.match(/(\d+)\s*min\s*x\s*(\d+)\s*sessions?\s*=\s*(\d+)\s*min\s*(Weekly|Daily|Monthly)/i);

  if (!durationMatch) return null;

  return {
    code,
    name,
    startDate,
    endDate,
    minutesPerSession: parseInt(durationMatch[1], 10),
    sessionsPerPeriod: parseInt(durationMatch[2], 10),
    totalMinutes: parseInt(durationMatch[3], 10),
    frequency: durationMatch[4],
    provider: extractProvider(block),
  };
}

function extractProvider(block) {
  const providerMatch = block.match(/Provider[:\s]*([^\n]+)/i);
  if (providerMatch) {
    return providerMatch[1].trim();
  }

  // Look for "100 District of Service" pattern
  const districtMatch = block.match(/(\d+\s+District of Service)/i);
  if (districtMatch) {
    return districtMatch[1];
  }

  return null;
}

/**
 * Extract accommodations from the page
 * Based on screenshot: Program Accommodations with description, dates, location
 */
function extractAccommodations() {
  const accommodations = [];
  const allText = document.body.innerText;

  // Look for the accommodations section
  const accSection = allText.split(/Accommodations/i)[1];
  if (!accSection) return accommodations;

  // Find accommodation entries - they usually have dates and "classroom" location
  const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\w+)/g;
  let match;

  while ((match = datePattern.exec(accSection)) !== null) {
    // The text before this match is likely the accommodation description
    const beforeText = accSection.substring(0, match.index);
    const lines = beforeText.split('\n').filter(l => l.trim());
    const description = lines[lines.length - 1]?.trim();

    if (description && description.length > 20) {
      accommodations.push({
        description,
        startDate: match[1],
        endDate: match[2],
        location: match[3],
      });
    }
  }

  // Alternative: Look for accommodation rows in tables
  if (accommodations.length === 0) {
    const rows = document.querySelectorAll('tr, .accommodation-item');
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const description = cells[0]?.textContent?.trim();
        if (description && description.length > 20) {
          accommodations.push({
            description,
            startDate: cells[1]?.textContent?.trim(),
            endDate: cells[2]?.textContent?.trim(),
            location: cells[3]?.textContent?.trim() || 'classroom',
          });
        }
      }
    }
  }

  return accommodations;
}

// Log that content script is loaded
console.log('Speddy SEIS content script loaded');

// ==========================================
// PASSIVE MODE: Auto-extract on page load
// ==========================================

/**
 * Automatically extract data when the page loads
 * Sends to service worker for background comparison
 */
async function runPassiveExtraction() {
  const url = window.location.href;

  // Only run on Goals or Services pages
  if (!url.includes('/state/goals') && !url.includes('/state/services')) {
    return;
  }

  // Wait for page to fully load (SEIS is an AngularJS app)
  await waitForPageReady();

  let extractedData = null;
  let pageType = null;

  if (url.includes('/state/goals')) {
    pageType = 'goals';
    extractedData = extractGoalsPage();
  } else if (url.includes('/state/services')) {
    pageType = 'services';
    extractedData = extractServicesPage();
  }

  if (extractedData && extractedData.student) {
    // Send to service worker for background comparison
    chrome.runtime.sendMessage({
      action: 'passiveExtraction',
      pageType,
      student: extractedData.student,
      url,
    });
  }
}

/**
 * Wait for the page to be ready (SEIS uses AngularJS)
 * Returns when content is likely loaded
 */
function waitForPageReady() {
  return new Promise((resolve) => {
    // Check if page already has content
    const hasContent = document.body.innerText.length > 1000;

    if (hasContent) {
      // Give a bit more time for Angular to finish rendering
      setTimeout(resolve, 500);
      return;
    }

    // Wait for content to load
    let attempts = 0;
    const maxAttempts = 20;

    const checkInterval = setInterval(() => {
      attempts++;
      const contentLength = document.body.innerText.length;

      if (contentLength > 1000 || attempts >= maxAttempts) {
        clearInterval(checkInterval);
        setTimeout(resolve, 500); // Give Angular time to finish
      }
    }, 250);
  });
}

// Run passive extraction when page loads
if (document.readyState === 'complete') {
  runPassiveExtraction();
} else {
  window.addEventListener('load', runPassiveExtraction);
}

// Also handle SPA navigation (AngularJS route changes)
// Use debouncing to prevent excessive calls during rapid DOM changes
let lastUrl = location.href;
let navigationDebounceTimer = null;

new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;

    // Debounce: clear any pending timer and set a new one
    if (navigationDebounceTimer) {
      clearTimeout(navigationDebounceTimer);
    }
    navigationDebounceTimer = setTimeout(() => {
      navigationDebounceTimer = null;
      runPassiveExtraction();
    }, 1000);
  }
}).observe(document.body, { childList: true, subtree: true });
