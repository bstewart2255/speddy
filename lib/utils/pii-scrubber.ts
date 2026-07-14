/**
 * PII Scrubber Utility
 * Removes PII (student names, specific dates, and IDs) from IEP goals using
 * fast regex-based detection.
 *
 * NOTE: The AI-based scrubbing branch (behind a `useAI` flag no caller ever
 * set) was removed as dead code in SPE-219. Full removal of at-rest scrubbing
 * is tracked in SPE-238 (store imported goals verbatim).
 */

export interface ScrubbedGoal {
  original: string;
  scrubbed: string;
  piiDetected: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ScrubResult {
  goals: ScrubbedGoal[];
  errors: string[];
}

/**
 * Scrub PII from IEP goals using regex-based detection
 */
export async function scrubPIIFromGoals(
  goals: string[],
  studentFirstName: string,
  studentLastName: string
): Promise<ScrubResult> {
  const scrubbedGoals: ScrubbedGoal[] = [];
  for (const goal of goals) {
    const scrubbed = basicPIIScrub(goal, studentFirstName, studentLastName);
    scrubbedGoals.push({
      original: goal,
      scrubbed: scrubbed.text,
      piiDetected: scrubbed.removed,
      confidence: scrubbed.removed.length > 0 ? 'medium' : 'high'
    });
  }
  return { goals: scrubbedGoals, errors: [] };
}

/**
 * Basic PII scrubbing using regex: removes the student's name, specific dates,
 * and ID-like tokens from a single goal string.
 */
function basicPIIScrub(
  text: string,
  firstName: string,
  lastName: string
): { text: string; removed: string[] } {
  let scrubbed = text;
  const removed: string[] = [];

  // Remove full name
  const fullNameRegex = new RegExp(`${firstName}\\s+${lastName}`, 'gi');
  if (fullNameRegex.test(scrubbed)) {
    scrubbed = scrubbed.replace(fullNameRegex, '[STUDENT]');
    removed.push(`${firstName} ${lastName}`);
  }

  // Remove first name
  const firstNameRegex = new RegExp(`\\b${firstName}\\b`, 'gi');
  if (firstNameRegex.test(scrubbed)) {
    scrubbed = scrubbed.replace(firstNameRegex, '[STUDENT]');
    if (!removed.includes(firstName)) {
      removed.push(firstName);
    }
  }

  // Remove last name
  const lastNameRegex = new RegExp(`\\b${lastName}\\b`, 'gi');
  if (lastNameRegex.test(scrubbed)) {
    scrubbed = scrubbed.replace(lastNameRegex, '[STUDENT]');
    if (!removed.includes(lastName)) {
      removed.push(lastName);
    }
  }

  // Remove specific dates with patterns like "by March 2024", "by 3/15/24", "by March 15th"
  const datePatterns = [
    /by\s+\d{1,2}\/\d{1,2}\/\d{2,4}/gi, // by 3/15/24
    /by\s+\w+\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}/gi, // by March 15th, 2024
    /by\s+\w+\s+\d{4}/gi, // by March 2024
    /on\s+\d{1,2}\/\d{1,2}\/\d{2,4}/gi, // on 3/15/24
    /on\s+\w+\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}/gi // on March 15th, 2024
  ];

  for (const pattern of datePatterns) {
    const matches = scrubbed.match(pattern);
    if (matches) {
      matches.forEach(match => {
        removed.push(match);
      });
      scrubbed = scrubbed.replace(pattern, 'by [DATE]');
    }
  }

  // Remove district/student IDs (patterns like ID: 123456, #123456, Student ID: 123456)
  const idPattern = /(student\s*)?id\s*[:#]?\s*\d+/gi;
  const idMatches = scrubbed.match(idPattern);
  if (idMatches) {
    idMatches.forEach(match => {
      removed.push(match);
    });
    scrubbed = scrubbed.replace(idPattern, '[ID REMOVED]');
  }

  return { text: scrubbed, removed };
}
