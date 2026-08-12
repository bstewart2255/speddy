// lib/scheduling/scheduling-strategy.ts

/**
 * Auto-Schedule strategies (SPE-473).
 *
 * The auto-scheduler always honored the same fixed recipe: spread students into
 * the emptiest slots, preferring same-grade company only as a tiebreaker. Those
 * two goals pull against each other, and spreading always won — so grade
 * grouping effectively never happened, and providers had no way to say what they
 * actually wanted out of a run.
 *
 * A strategy does not change what is *legal* (bell schedules, special
 * activities, work days, capacity and cross-provider conflicts are all enforced
 * the same way regardless). It only changes the order in which legal slots are
 * tried, and the order students are placed in.
 */

export type SchedulingStrategy =
  | 'balanced'
  | 'grade-grouped'
  | 'teacher-grouped'
  | 'morning-first';

export const DEFAULT_SCHEDULING_STRATEGY: SchedulingStrategy = 'balanced';

/**
 * Strategies that cluster students into shared slots so they can be run as one
 * group, rather than spreading them out.
 */
const GROUPING_STRATEGIES: ReadonlySet<SchedulingStrategy> = new Set([
  'grade-grouped',
  'teacher-grouped',
]);

export function isGroupingStrategy(strategy: SchedulingStrategy): boolean {
  return GROUPING_STRATEGIES.has(strategy);
}

/** Copy for the picker. Descriptions are what the provider reads, so no jargon. */
export const SCHEDULING_STRATEGY_OPTIONS: ReadonlyArray<{
  value: SchedulingStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'balanced',
    label: 'Balanced',
    description:
      'Spread sessions evenly across your days and keep group sizes small. A good default when you have no particular preference.',
  },
  {
    value: 'grade-grouped',
    label: 'Group by grade',
    description:
      'Put students in the same grade into the same time slots, so you can run them together as a group.',
  },
  {
    value: 'teacher-grouped',
    label: 'Group by teacher',
    description:
      'Pull students from the same class at the same time, so each teacher is interrupted once instead of several times.',
  },
  {
    value: 'morning-first',
    label: 'Prefer mornings',
    description:
      'Fill the earliest available times first, leaving afternoons freer for meetings, testing and paperwork.',
  },
];

export function isSchedulingStrategy(value: unknown): value is SchedulingStrategy {
  return SCHEDULING_STRATEGY_OPTIONS.some((option) => option.value === value);
}

/** The student fields a grouping key can be derived from. */
export interface GroupableStudent {
  grade_level?: string | null;
  teacher_id?: string | null;
  teacher_name?: string | null;
}

/**
 * The key two students must share to be considered groupable under `strategy`,
 * or null when this strategy doesn't group, or when the student is missing the
 * field it groups on.
 *
 * Null is deliberately NOT a joinable key: two students who both lack a teacher
 * are not "in the same class", and grouping them would be a guess. A student
 * with no key just falls back to balanced placement.
 */
export function getGroupingKey(
  student: GroupableStudent,
  strategy: SchedulingStrategy
): string | null {
  switch (strategy) {
    case 'grade-grouped': {
      const grade = student.grade_level?.trim();
      return grade ? `grade:${grade}` : null;
    }
    case 'teacher-grouped': {
      // Prefer teacher_id: teacher_name is free text, and the same teacher shows
      // up under several spellings across uploads (SPE-338). Where the id is
      // missing we fall back to a normalized name, which under-groups (two
      // spellings look like two teachers) rather than over-groups.
      if (student.teacher_id) return `teacher:${student.teacher_id}`;
      const name = student.teacher_name?.trim().toLowerCase();
      return name ? `teacher:name:${name}` : null;
    }
    default:
      return null;
  }
}
