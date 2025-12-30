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
