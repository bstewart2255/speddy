import { canScheduleAtSecondary } from '@/lib/school-helpers';
import { isSpecialistSourceRole } from '@/lib/auth/role-utils';

/**
 * Setup guides (SPE-521 provider, SPE-522 site admin).
 *
 * Pure derivation of the dashboard setup-guide checklists: which items each
 * audience sees for a school, and whether each is done. Data fetching lives
 * in `lib/supabase/queries/setup-guide.ts`; rendering in
 * `app/components/onboarding/`. Keeping this pure makes the role ×
 * school-level matrix unit-testable without a Supabase client.
 *
 * The guides stay at "is the tool in the drawer" altitude — data foundations
 * only, never a feature tour (owner decision, 2026-08-17).
 */

export type SetupGuideItemId =
  // Provider guide
  | 'students'
  | 'work-schedule'
  | 'bell-schedules'
  | 'special-activities'
  | 'schedule-sessions'
  // Site admin guide
  | 'school-facts'
  | 'teachers-staff'
  | 'master-schedule'
  | 'caseloads';

export interface SetupGuideItem {
  id: SetupGuideItemId;
  title: string;
  description: string;
  /** Where the title links; omitted when there is no in-app page to act on. */
  href?: string;
  /**
   * done — auto-detected from real data; todo — actionable now;
   * waiting — blocked on someone else (named in `waitingOn`).
   */
  state: 'done' | 'todo' | 'waiting';
  /** Who unblocks a waiting item (e.g. "your providers"). */
  waitingOn?: string;
  /**
   * Shared items have an ideal owner but either party can complete them, and
   * data from either source counts. The value is the tag text naming the
   * partnership from this audience's side (e.g. "You or your site admin").
   */
  sharedWith?: string;
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

const PROVIDER_SHARED_TAG = 'You or your site admin';
const PROVIDER_SHARED_NOTE =
  ' Ideally your site admin enters this once for the whole school — add it yourself if you would rather not wait.';

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
  });

  if (worksAtMultipleSchools) {
    items.push({
      id: 'work-schedule',
      title: 'Set your work schedule',
      description:
        'Which days you spend at which school, so sessions land on days you are actually on site.',
      href: '/dashboard/settings',
      state: facts.hasSiteSchedules ? 'done' : 'todo',
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
      description:
        (isSecondary
          ? 'The period times the whole school runs on. Entered once, they cover every grade.'
          : 'Recess, lunch and other grade-level blocks, so sessions never collide with them.') +
        PROVIDER_SHARED_NOTE,
      href: '/dashboard/bell-schedules',
      state: facts.hasBellSchedules ? 'done' : 'todo',
      sharedWith: PROVIDER_SHARED_TAG,
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
        "Your teachers' regular commitments — PE, library, music — so pull-out sessions steer around them." +
        PROVIDER_SHARED_NOTE,
      href: '/dashboard/special-activities',
      state: activitiesDone ? 'done' : 'todo',
      sharedWith: PROVIDER_SHARED_TAG,
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
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Site admin guide (SPE-522)
// ---------------------------------------------------------------------------

export interface SiteAdminSetupFacts {
  schoolTypePresent: boolean;
  gradeSpanPresent: boolean;
  hasTeachers: boolean;
  hasStaff: boolean;
  hasBellSchedules: boolean;
  hasSpecialActivities: boolean;
  /** Providers whose primary school is this school. */
  providerCount: number;
  /** How many of those providers have at least one student here. */
  providersWithStudents: number;
}

export function deriveSiteAdminSetupItems(args: {
  isSecondary: boolean;
  facts: SiteAdminSetupFacts;
}): SetupGuideItem[] {
  const { isSecondary, facts } = args;
  const items: SetupGuideItem[] = [];

  // The school record's type and grade span decide the elementary vs
  // secondary experience everywhere; only Speddy staff can correct them, so
  // an unset value waits on support rather than linking anywhere.
  const factsPresent = facts.schoolTypePresent && facts.gradeSpanPresent;
  items.push({
    id: 'school-facts',
    title: "Check the school's facts",
    description:
      "The school's type and grade span decide whether staff get the elementary or secondary experience everywhere in Speddy. They are not set yet — contact Speddy support to fix them.",
    state: factsPresent ? 'done' : 'waiting',
    waitingOn: factsPresent ? undefined : 'Speddy support',
  });

  // Teachers arrive from the district's SIS sync; the staff list (aides, duty
  // staff) is the admin's to build. One drawer item covering both lists.
  const teachersStaffDone = facts.hasTeachers && facts.hasStaff;
  items.push({
    id: 'teachers-staff',
    title: 'Teacher & staff lists',
    description: !facts.hasTeachers
      ? "Your teacher list fills from the district's SIS sync — no accounts to create. Add one by hand only for someone the SIS doesn't carry, and build your staff list (aides, duty staff) meanwhile."
      : 'Teachers are in — now build your staff list (aides, duty staff), which providers reference on schedules.',
    href: !facts.hasTeachers
      ? '/dashboard/admin/teachers'
      : '/dashboard/admin/staff',
    state: teachersStaffDone
      ? 'done'
      : facts.hasTeachers
        ? 'todo'
        : 'waiting',
    waitingOn: facts.hasTeachers ? undefined : "the district's SIS sync",
  });

  // Flip side of the provider guide's shared items: entered once here, every
  // provider's checklist counts it — and provider-entered data counts here.
  // At secondary the school runs on a period grid and special activities
  // don't apply.
  const scheduleDataDone =
    facts.hasBellSchedules && (isSecondary || facts.hasSpecialActivities);
  items.push({
    id: 'master-schedule',
    title: isSecondary
      ? "Put the school's period grid in"
      : 'Put bell schedules & special activities in',
    description: isSecondary
      ? 'The period times the whole school runs on, entered once — so providers scheduling here never collide with them.'
      : "Recess, lunch and teachers' regular commitments (PE, library, music), entered once for the whole school — so your providers don't each have to. Anything a provider already entered counts too.",
    href: '/dashboard/admin/master-schedule',
    state: scheduleDataDone ? 'done' : 'todo',
    sharedWith: 'You or your providers',
  });

  // The admin's rollout pulse-check: caseloads land as providers add
  // students. Providers themselves arrive from the district kickoff import.
  const caseloadsDone =
    facts.providerCount > 0 &&
    facts.providersWithStudents >= facts.providerCount;
  items.push({
    id: 'caseloads',
    title: 'Watch the caseloads land',
    description:
      facts.providerCount === 0
        ? 'No provider accounts at this school yet — they arrive with the district kickoff. The Students page fills as providers add their caseloads.'
        : `${facts.providersWithStudents} of ${facts.providerCount} providers have students on their caseload. The Students page fills as they add the rest.`,
    href: '/dashboard/admin/students',
    state: caseloadsDone ? 'done' : 'waiting',
    waitingOn: caseloadsDone
      ? undefined
      : facts.providerCount === 0
        ? 'the district kickoff'
        : 'your providers',
  });

  return items;
}
