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

// Case status options (shown as "Status" in UI, stored as current_disposition in DB)
export const CARE_DISPOSITIONS = [
  { value: 'teacher_consult', label: 'Teacher Consult' },
  { value: 'wait_for_report_card', label: 'Wait for Report Card' },
  { value: 'wait_for_assessment_data', label: 'Wait for Assessment Data' },
  { value: 'intervention', label: 'Intervention' },
  { value: 'counseling_referral', label: 'Counseling Referral' },
  { value: 'schedule_sst', label: 'Schedule SST' },
  { value: 'send_ap', label: 'Send AP' },
  { value: 'move_to_initials', label: "Move to 'Initials'" },
] as const;

export type CareDisposition = (typeof CARE_DISPOSITIONS)[number]['value'];

// Referral status options (stages)
export const CARE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'initial', label: 'Initial' },
  { value: 'closed', label: 'Closed' },
] as const;

export type CareStatus = (typeof CARE_STATUSES)[number]['value'];

// Status colors for UI
export const CARE_STATUS_COLORS: Record<CareStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-blue-100 text-blue-800',
  initial: 'bg-purple-100 text-purple-800',
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
