/**
 * Activity type constants for Bell Schedules and Special Activities
 */

// Bell Schedule activity types (school-wide scheduling blocks)
export const BELL_SCHEDULE_ACTIVITIES = [
  'Recess',
  'Lunch',
  'Lunch Recess',
  'Snack',
  'PE',
] as const;

export type BellScheduleActivity = (typeof BELL_SCHEDULE_ACTIVITIES)[number];

// Special Activity types (teacher-specific activities)
export const SPECIAL_ACTIVITY_TYPES = [
  'Library',
  'STEAM',
  'STEM',
  'Garden',
  'Music',
  'ART',
  'PE',
] as const;

export type SpecialActivityType = (typeof SPECIAL_ACTIVITY_TYPES)[number];

// Instruction schedule subjects (teacher instruction blocks)
export const INSTRUCTION_SUBJECTS = [
  'ELA',
  'Math',
  'Science',
  'ELD',
  'SEL',
  'Social Studies',
  'Prep',
  'Intervention',
  'Academy',
  'STEM',
] as const;

export type InstructionSubject = (typeof INSTRUCTION_SUBJECTS)[number];
