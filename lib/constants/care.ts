/**
 * CARE Meeting Module constants
 */

// Referral categories
export const CARE_CATEGORIES = [
  { value: 'academic', label: 'Academic' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'social-emotional', label: 'Social-Emotional' },
  { value: 'speech', label: 'Speech' },
  { value: 'ot', label: 'OT' },
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
  { value: 'close_case', label: 'Close Referral' },
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
  speech: 'bg-teal-100 text-teal-800',
  ot: 'bg-orange-100 text-orange-800',
  other: 'bg-gray-100 text-gray-600',
};

// Grade options (TK-5 for elementary CARE meetings)
export const GRADE_OPTIONS = [
  'TK', 'K', '1', '2', '3', '4', '5'
] as const;

export type Grade = (typeof GRADE_OPTIONS)[number];

// Referral source -- how the referral came in; drives intake form and entry lane
export const CARE_REFERRAL_SOURCES = [
  { value: 'teacher_concern', label: 'Teacher Concern' },
  { value: 'parent_concern', label: 'Parent Concern' },
  { value: 'staff_concern', label: 'Staff Concern' },
  { value: 'parent_written_request', label: 'Parent Written Request for Evaluation' },
  { value: 'private_school', label: 'Private School Referral' },
] as const;

export type CareReferralSource = (typeof CARE_REFERRAL_SOURCES)[number]['value'];

// Sources that enter the compliance lane (Lane B) directly at intake,
// with a timeline already running. Other sources start in the discussion
// lane (Lane A) and may be promoted later.
export const COMPLIANCE_LANE_SOURCES: CareReferralSource[] = [
  'parent_written_request',
  'private_school',
];

// Eligibility determination outcome (result of the compliance-lane process)
export const ELIGIBILITY_OUTCOMES = [
  { value: 'eligible', label: 'Eligible' },
  { value: 'not_eligible', label: 'Not Eligible' },
  { value: 'eligible_504_only', label: 'Eligible — 504 Only' },
] as const;

export type EligibilityOutcome = (typeof ELIGIBILITY_OUTCOMES)[number]['value'];

// The 13 federal IDEA disability categories (34 CFR 300.8)
export const ELIGIBILITY_CATEGORIES = [
  { value: 'autism', label: 'Autism' },
  { value: 'deaf_blindness', label: 'Deaf-Blindness' },
  { value: 'deafness', label: 'Deafness' },
  { value: 'emotional_disturbance', label: 'Emotional Disturbance' },
  { value: 'hearing_impairment', label: 'Hearing Impairment' },
  { value: 'intellectual_disability', label: 'Intellectual Disability' },
  { value: 'multiple_disabilities', label: 'Multiple Disabilities' },
  { value: 'orthopedic_impairment', label: 'Orthopedic Impairment' },
  { value: 'other_health_impairment', label: 'Other Health Impairment' },
  { value: 'specific_learning_disability', label: 'Specific Learning Disability' },
  { value: 'speech_language_impairment', label: 'Speech or Language Impairment' },
  { value: 'traumatic_brain_injury', label: 'Traumatic Brain Injury' },
  { value: 'visual_impairment', label: 'Visual Impairment' },
] as const;

export type EligibilityCategory = (typeof ELIGIBILITY_CATEGORIES)[number]['value'];
