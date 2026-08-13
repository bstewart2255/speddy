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

// Secondary (middle/high) bell-schedule blocks (SPE-491). Two kinds live in
// one list: CLASS PERIODS ("Period …"), which describe the day's structure —
// pull-outs happen DURING periods, so these never raise conflicts (see
// isClassPeriodBlock) — and school-wide breaks (Brunch/Lunch/etc), which
// conflict exactly like elementary bell blocks. "Period A" is a before-school
// zero period (John Swett HS evidence, 2026-08-13).
export const SECONDARY_BELL_SCHEDULE_ACTIVITIES = [
  'Period A',
  'Period 1',
  'Period 2',
  'Period 3',
  'Period 4',
  'Period 5',
  'Period 6',
  'Period 7',
  'Period 8',
  'Advisory',
  'Brunch',
  'Lunch',
  'Passing',
] as const;

export type SecondaryBellScheduleActivity =
  (typeof SECONDARY_BELL_SCHEDULE_ACTIVITIES)[number];

/**
 * Whether a bell-schedule block names a CLASS PERIOD ("Period 1", "Period A")
 * rather than a protected break. Class periods are the slots secondary
 * pull-outs happen INSIDE of, so every conflict surface (drag warning,
 * auto-scheduler, availability bands, post-insert conflict marking) must
 * skip them — otherwise the entire school day reads as blocked (SPE-491).
 *
 * Matched by name because the elementary entry form and CSV import validate
 * against BELL_SCHEDULE_ACTIVITIES (no "Period …" names can exist there), so
 * only the secondary picklist mints these. The pattern is deliberately exact
 * — a bare label like "Period 3" — so a descriptive name ("Reading Period")
 * keeps full conflict behavior.
 */
export function isClassPeriodBlock(periodName?: string | null): boolean {
  if (!periodName) return false;
  return /^\s*period\s*[a-z0-9]{0,3}\s*$/i.test(periodName);
}

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
