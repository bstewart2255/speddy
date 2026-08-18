/**
 * Service Type Code Mapping
 * Maps provider roles to SEIS service type codes for IEP goal filtering
 */

import { escapeRegExp } from '../utils/regex';

export const SERVICE_TYPE_CODES = {
  resource: '330',      // Specialized Academic Instruction
  speech: '415',        // Language and Speech
  ot: '450',            // Occupational Therapy
  counseling: '510',    // Individual Counseling
  psychologist: null,   // No specific code - imports all goals
  specialist: null,     // No specific code - imports all goals
  sea: null,            // SEAs don't import goals directly
} as const;

/**
 * Counseling is delivered under either of two SEIS codes, and which one a
 * district uses is a local convention rather than a rule (JSUSD, confirmed by
 * their school psychologist 2026-08-18: "counseling services are either listed
 * as 510 Individual Counseling or 515 Counseling and Guidance"). Matching only
 * one of them imports nothing for half the districts that use the other.
 */
const COUNSELING_DELIVERY_CODES = ['510', '515'] as const;

/**
 * Service codes for the DELIVERIES import, per role (SPE-554).
 *
 * The goals import and the deliveries import ask different questions of a
 * role, and only the goals answer is `SERVICE_TYPE_CODES`:
 *
 *   goals      — "whose goals may this provider SEE?"
 *   deliveries — "which service minutes does this provider DELIVER?"
 *
 * The distinction bites hardest for `psychologist`. A school psych sits on
 * every IEP team and runs triennials, so importing every student's goals is
 * correct and stays as-is. But the service they deliver is counseling, and
 * deliveries become the provider's OWN `sessions_per_week`/`minutes_per_session`.
 * Left unfiltered, a psych's import wrote other providers' speech/OT/academic
 * minutes into their caseload as counseling sessions — and because the parser
 * keeps one row per student (most recent start date), each student silently
 * landed on whichever service happened to win. Observed at JSUSD 2026-08-18:
 * a 300 min/week academic mandate would have become ten 30-minute counseling
 * sessions.
 *
 * A role absent from this map accepts every service, which is the right
 * default for roles with no single service of their own (specialist,
 * intervention) and for SEAs, who don't import deliveries.
 */
const DELIVERY_SERVICE_TYPE_CODES: Record<string, readonly string[]> = {
  resource: ['330'],                        // Specialized Academic Instruction
  speech: ['415'],                          // Language and Speech
  ot: ['450'],                              // Occupational Therapy
  counseling: COUNSELING_DELIVERY_CODES,
  psychologist: COUNSELING_DELIVERY_CODES,  // what a school psych delivers
};

export const SERVICE_TYPE_NAMES: Record<string, string> = {
  '330': 'Specialized Academic Instruction',
  '415': 'Language and Speech',
  '450': 'Occupational Therapy',
  '510': 'Individual Counseling',
  '515': 'Counseling and Guidance',
};

export type ProviderRoleWithServiceType = keyof typeof SERVICE_TYPE_CODES;

/**
 * Get the SEIS service type code for a provider role
 * @param role - The provider's role (resource, speech, ot, counseling, etc.)
 * @returns The service type code (e.g., '330') or null if no specific code
 */
export function getServiceTypeCode(role: string): string | null {
  const normalizedRole = role.toLowerCase().trim();
  return SERVICE_TYPE_CODES[normalizedRole as ProviderRoleWithServiceType] ?? null;
}

/**
 * Get the SEIS service type codes that filter a provider's DELIVERIES import —
 * the services whose minutes belong to this provider (SPE-554).
 *
 * @param role - The provider's role
 * @returns The codes this role delivers; EMPTY means accept every service
 */
export function getDeliveryServiceTypeCodes(role: string): readonly string[] {
  return DELIVERY_SERVICE_TYPE_CODES[role.toLowerCase().trim()] ?? [];
}

/**
 * Get the service type name from a code
 * @param code - The service type code (e.g., '330')
 * @returns The human-readable name or null if not found
 */
export function getServiceTypeName(code: string): string | null {
  return SERVICE_TYPE_NAMES[code] ?? null;
}

/**
 * Check if a service code matches the provider's role
 * Used for filtering deliveries/schedules by service type
 * @param serviceCode - The service code from the file (may include description)
 * @param role - The provider's role
 * @returns true if the service code matches the role's expected code
 */
export function isServiceCodeForRole(serviceCode: string, role: string): boolean {
  // Deliveries define the provider's own service minutes, so this asks the
  // delivery question, not the goal-visibility one (SPE-554).
  const expectedCodes = getDeliveryServiceTypeCodes(role);
  // No expected codes (e.g., specialist, intervention): include all services
  if (expectedCodes.length === 0) return true;
  return expectedCodes.some(code => serviceCode.includes(code));
}

/**
 * Get the service type name for a provider role
 * @param role - The provider's role
 * @returns Human-readable service type name or 'academic' as fallback
 */
export function getServiceTypeNameForRole(role: string): string {
  const code = getServiceTypeCode(role);
  if (!code) return 'academic';
  return getServiceTypeName(code) || 'academic';
}

/**
 * Provider keyword patterns for text-based goal filtering
 * Used when SEIS reports contain provider names instead of numeric service codes
 * (e.g., SEIS Student Goals Report)
 */
export const PROVIDER_KEYWORDS: Record<string, string[]> = {
  speech: [
    'speech',
    'language',
    'slp',
    'speech/language',
    'speech-language',
  ],
  resource: [
    'academic',
    'reading',
    'math',
    // Word-boundary matching means "math" no longer matches inside
    // "mathematics", so the spelled-out form is listed explicitly (SPE-247).
    'mathematics',
    'written',
    'writing',
    'rsp',
    'resource',
    'special ed',
    'special education',
    'specialized academic',
  ],
  ot: [
    'motor',
    'fine motor',
    'gross motor',
    'occupational',
    'ot',
    'handwriting',
  ],
  counseling: [
    'social',
    'emotional',
    'social/emotional',
    'social-emotional',
    'behavior',
    'behavioral',
    'counselor',
    'counseling',
  ],
};

/**
 * One word-boundary-anchored alternation per role, compiled once from
 * PROVIDER_KEYWORDS. Word boundaries (not substring `includes`) stop keywords
 * from matching inside longer unrelated words — the cross-contamination that
 * routed "Handwriting" to resource (via `writing`) and "Social/Emotional" to
 * OT (via `ot` inside "emOTional"). See SPE-247.
 */
const PROVIDER_KEYWORD_PATTERNS: Record<string, RegExp> = Object.fromEntries(
  Object.entries(PROVIDER_KEYWORDS).map(([role, keywords]) => [
    role,
    new RegExp(`\\b(?:${keywords.map(escapeRegExp).join('|')})\\b`, 'i'),
  ])
);

/**
 * Check if goal text matches a provider's keywords
 * Used for filtering SEIS Student Goals Report by provider type
 *
 * Matches on whole words (word boundaries), so `writing` no longer matches
 * inside "Handwriting" and `ot` no longer matches inside "emotional".
 *
 * @param text - Text from Area of Need, Annual Goal #, or Person Responsible columns
 * @param providerRole - The provider's role (resource, speech, ot, counseling)
 * @returns true if the text contains keywords matching the provider's role
 */
export function doesTextMatchProvider(text: string, providerRole: string): boolean {
  if (!text) return false;

  const normalizedRole = providerRole.toLowerCase().trim();
  const pattern = PROVIDER_KEYWORD_PATTERNS[normalizedRole];

  // If no keywords defined for this role (e.g., psychologist), don't filter
  if (!pattern) return true;

  return pattern.test(text);
}

/**
 * A goal row has no routing signal when Area of Need, Annual Goal #, and Person
 * Responsible are all blank. Such a row can't be attributed to any provider by
 * keyword, so instead of silently filtering it out for every keyworded role,
 * callers surface it for manual review rather than letting it vanish (SPE-247).
 */
export function hasNoProviderRoutingSignal(
  areaOfNeed: string | undefined,
  goalNumber: string | undefined,
  personResponsible: string | undefined
): boolean {
  return !areaOfNeed?.trim() && !goalNumber?.trim() && !personResponsible?.trim();
}

/**
 * The single "needs review" message for a goal row that hasNoProviderRoutingSignal.
 * Shared so the CSV (parseCSVReport) and XLSX (parseSEISReport) paths can't drift
 * (SPE-247/SPE-248).
 */
export function blankMetadataGoalWarning(initials: string, gradeLevel: string): string {
  return `Goal for student ${initials} (grade ${gradeLevel}) has no Area of Need, Annual Goal #, or Person Responsible and could not be routed to a provider — please review and assign it manually.`;
}

/**
 * Check if a goal belongs to a provider based on multiple column values
 * Checks Area of Need, Annual Goal #, and Person Responsible columns
 *
 * @param areaOfNeed - Column L: Area of Need (e.g., "Speech/Language", "Academic")
 * @param goalNumber - Column M: Annual Goal # (e.g., "Speech (1 of 1)", "Academic (2 of 3)")
 * @param personResponsible - Column R: Person Responsible (e.g., "SLP, Teacher", "Resource Specialist")
 * @param providerRole - The provider's role
 * @returns true if any column indicates the goal belongs to this provider
 */
export function isGoalForProviderByKeywords(
  areaOfNeed: string | undefined,
  goalNumber: string | undefined,
  personResponsible: string | undefined,
  providerRole: string
): boolean {
  const normalizedRole = providerRole.toLowerCase().trim();

  // Roles without specific keywords import all goals
  if (!PROVIDER_KEYWORDS[normalizedRole]) {
    return true;
  }

  // Check each column - if ANY matches, include the goal
  if (areaOfNeed && doesTextMatchProvider(areaOfNeed, providerRole)) {
    return true;
  }

  if (goalNumber && doesTextMatchProvider(goalNumber, providerRole)) {
    return true;
  }

  if (personResponsible && doesTextMatchProvider(personResponsible, providerRole)) {
    return true;
  }

  // No match found in any column
  return false;
}
