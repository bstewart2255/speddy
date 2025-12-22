/**
 * CARE Meeting Module constants
 */

// Referral categories
export const CARE_CATEGORIES = [
  { value: 'academic', label: 'Academic' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'social-emotional', label: 'Social-Emotional' },
  { value: 'other', label: 'Other' },
] as const;

export type CareCategory = (typeof CARE_CATEGORIES)[number]['value'];

// Case disposition options
export const CARE_DISPOSITIONS = [
  { value: 'classroom_interventions', label: 'Classroom Interventions' },
  { value: 'tier_2_interventions', label: 'Tier 2 Interventions' },
  { value: 'refer_for_evaluation', label: 'Refer for Evaluation' },
  { value: 'counseling_referral', label: 'Counseling Referral' },
  { value: 'closed_resolved', label: 'Closed - Resolved' },
] as const;

export type CareDisposition = (typeof CARE_DISPOSITIONS)[number]['value'];

// Referral status options
export const CARE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
] as const;

export type CareStatus = (typeof CARE_STATUSES)[number]['value'];

// Status colors for UI
export const CARE_STATUS_COLORS: Record<CareStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-blue-100 text-blue-800',
  closed: 'bg-gray-100 text-gray-600',
};

// Category colors for UI
export const CARE_CATEGORY_COLORS: Record<CareCategory, string> = {
  academic: 'bg-purple-100 text-purple-800',
  behavioral: 'bg-red-100 text-red-800',
  attendance: 'bg-yellow-100 text-yellow-800',
  'social-emotional': 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-600',
};

// Grade options (TK-5 for elementary CARE meetings)
export const GRADE_OPTIONS = [
  'TK', 'K', '1', '2', '3', '4', '5'
] as const;

export type Grade = (typeof GRADE_OPTIONS)[number];
