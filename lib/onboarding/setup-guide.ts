import { canScheduleAtSecondary } from '@/lib/school-helpers';
import { isSpecialistSourceRole } from '@/lib/auth/role-utils';

/**
 * Provider setup guide (SPE-521).
 *
 * Pure derivation of the dashboard setup-guide checklist: which items a
 * provider sees for the active school, and whether each is done. Data
 * fetching lives in `lib/supabase/queries/setup-guide.ts`; rendering in
 * `app/components/onboarding/setup-guide-card.tsx`. Keeping this pure makes
 * the role × school-level matrix unit-testable without a Supabase client.
 *
 * The guide stays at "is the tool in the drawer" altitude — data foundations
 * only, never a feature tour (owner decision, 2026-08-17).
 */

export type SetupGuideItemId =
  | 'students'
  | 'work-schedule'
  | 'bell-schedules'
  | 'special-activities'
  | 'schedule-sessions';

export interface SetupGuideItem {
  id: SetupGuideItemId;
  title: string;
  description: string;
  href: string;
  state: 'done' | 'todo';
  /**
   * Shared items have an ideal owner (the site admin, via the Master
   * Schedule) but either party can complete them, and data from either
   * source counts.
   */
  shared: boolean;
  /** Special-activities only: completed via the "my teachers have none" escape hatch. */
  markedNone?: boolean;
}

export interface ProviderSetupFacts {
  hasStudents: boolean;
  hasSiteSchedules: boolean;
  hasBellSchedules: boolean;
  hasSpecialActivities: boolean;
  /** The "my teachers have none" escape hatch (stored client-side). */
  activitiesMarkedNone: boolean;
  unscheduledCount: number;
}

/** The seven provider roles whose dashboard shows the setup guide. */
export function isProviderSetupRole(role: string | null | undefined): boolean {
  return !!role && isSpecialistSourceRole(role.trim());
}

/**
 * Whether this role schedules discrete sessions at this school level — the
 * predicate behind the schedule-sessions item. Exported so the facts fetch
 * can skip the unscheduled-count queries when the item cannot appear.
 */
export function schedulesSessionsAtLevel(
  role: string,
  isSecondary: boolean
): boolean {
  return !isSecondary || canScheduleAtSecondary(role);
}

export function deriveProviderSetupItems(args: {
  role: string;
  isSecondary: boolean;
  worksAtMultipleSchools: boolean;
  facts: ProviderSetupFacts;
}): SetupGuideItem[] {
  const { role, isSecondary, worksAtMultipleSchools, facts } = args;
  const items: SetupGuideItem[] = [];

  items.push({
    id: 'students',
    title: 'Add your students',
    description:
      'Import a list, add them one at a time — or your roster may arrive automatically if your district has an SIS sync running.',
    href: '/dashboard/students',
    state: facts.hasStudents ? 'done' : 'todo',
    shared: false,
  });

  if (worksAtMultipleSchools) {
    items.push({
      id: 'work-schedule',
      title: 'Set your work schedule',
      description:
        'Which days you spend at which school, so sessions land on days you are actually on site.',
      href: '/dashboard/settings',
      state: facts.hasSiteSchedules ? 'done' : 'todo',
      shared: false,
    });
  }

  // At a secondary site, only roles that keep the Bell Schedules page get the
  // item: related services (canScheduleAtSecondary) and resource, which enters
  // the school's period grid there (SPE-513). Specialist/intervention lose all
  // scheduling surfaces at secondary, so a link would dead-end for them.
  const keepsBellSchedules =
    !isSecondary || role.trim() === 'resource' || canScheduleAtSecondary(role);
  if (keepsBellSchedules) {
    items.push({
      id: 'bell-schedules',
      title: isSecondary
        ? "Enter the school's period grid"
        : 'Enter bell schedules',
      description: isSecondary
        ? 'The period times the whole school runs on. Entered once, they cover every grade.'
        : 'Recess, lunch and other grade-level blocks, so sessions never collide with them.',
      href: '/dashboard/bell-schedules',
      state: facts.hasBellSchedules ? 'done' : 'todo',
      shared: true,
    });
  }

  // Special activities are an elementary concept (teacher-level commitments);
  // secondary sites plan per-student instead.
  if (!isSecondary) {
    const activitiesDone =
      facts.hasSpecialActivities || facts.activitiesMarkedNone;
    items.push({
      id: 'special-activities',
      title: 'Enter special activities',
      description:
        "Your teachers' regular commitments — PE, library, music — so pull-out sessions steer around them.",
      href: '/dashboard/special-activities',
      state: activitiesDone ? 'done' : 'todo',
      shared: true,
      markedNone: !facts.hasSpecialActivities && facts.activitiesMarkedNone,
    });
  }

  // Scheduling: everyone at elementary; only related services at secondary.
  // Secondary resource plans service time on the period week view instead —
  // the unscheduled-sessions count is not meaningful there (the students page
  // suppresses the same alert for them), so the item is omitted rather than
  // shown with a misleading check.
  if (schedulesSessionsAtLevel(role, isSecondary)) {
    const scheduled = facts.hasStudents && facts.unscheduledCount === 0;
    items.push({
      id: 'schedule-sessions',
      title: 'Schedule your sessions',
      description:
        facts.hasStudents && facts.unscheduledCount > 0
          ? facts.unscheduledCount === 1
            ? '1 session still needs a spot — drag it on, or use Auto-Schedule.'
            : `${facts.unscheduledCount} sessions still need a spot — drag them on, or use Auto-Schedule.`
          : 'Place sessions by drag and drop, or let Auto-Schedule fill the week.',
      href: '/dashboard/schedule',
      state: scheduled ? 'done' : 'todo',
      shared: false,
    });
  }

  return items;
}
