/**
 * Service Type Code Mapping
 * Maps provider roles to SEIS service type codes for IEP goal filtering
 */

export const SERVICE_TYPE_CODES = {
  resource: '330',      // Specialized Academic Instruction
  speech: '415',        // Language and Speech
  ot: '450',            // Occupational Therapy
  counseling: '510',    // Individual Counseling
  psychologist: null,   // No specific code - imports all goals
  specialist: null,     // No specific code - imports all goals
  sea: null,            // SEAs don't import goals directly
} as const;

export const SERVICE_TYPE_NAMES: Record<string, string> = {
  '330': 'Specialized Academic Instruction',
  '415': 'Language and Speech',
  '450': 'Occupational Therapy',
  '510': 'Individual Counseling',
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
  const expectedCode = getServiceTypeCode(role);
  // If no expected code (e.g., psychologist), include all services
  if (!expectedCode) return true;
  return serviceCode.includes(expectedCode);
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
 * Check if goal text matches a provider's keywords
 * Used for filtering SEIS Student Goals Report by provider type
 *
 * @param text - Text from Area of Need, Annual Goal #, or Person Responsible columns
 * @param providerRole - The provider's role (resource, speech, ot, counseling)
 * @returns true if the text contains keywords matching the provider's role
 */
export function doesTextMatchProvider(text: string, providerRole: string): boolean {
  if (!text) return false;

  const normalizedRole = providerRole.toLowerCase().trim();
  const keywords = PROVIDER_KEYWORDS[normalizedRole];

  // If no keywords defined for this role (e.g., psychologist), don't filter
  if (!keywords) return true;

  const lowerText = text.toLowerCase();

  // Check if any keyword is found in the text
  return keywords.some(keyword => lowerText.includes(keyword));
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
