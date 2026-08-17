import { createClient } from '@/lib/supabase/client';
import { buildSchoolFilter, type SchoolIdentifier } from '@/lib/school-helpers';
import { getCurrentSchoolYear } from '@/lib/school-year';
import type { ProviderSetupFacts } from '@/lib/onboarding/setup-guide';
import { getUnscheduledSessionsCount } from './schedule-sessions';
import type { Database } from '../../../src/types/database';

/**
 * Existence checks behind the provider setup guide (SPE-521).
 *
 * Bell schedules and special activities are checked SCHOOL-WIDE, not
 * provider-owned: admin entries from the Master Schedule land in the same
 * school-scoped tables (with `provider_id` null), and either source counts.
 * The old onboarding banner checked `provider_id = user` and so kept nagging
 * providers whose site admin had already entered everything. Both checks are
 * scoped to the CURRENT school year, because every page that displays these
 * rows filters on it (SPE-460) — a prior-year row must not check the item
 * while the linked page renders empty. Legacy accounts without a structured
 * `school_id` fall back to provider-owned rows, matching `getBellSchedules`.
 */
export async function getProviderSetupFacts(
  userId: string,
  school: SchoolIdentifier,
  options: {
    /**
     * The schedule-sessions item is omitted for some role/level combinations
     * (see `schedulesSessionsAtLevel`); skip its count queries then.
     */
    includeUnscheduledCount: boolean;
  }
): Promise<Omit<ProviderSetupFacts, 'activitiesMarkedNone'>> {
  const supabase = createClient<Database>();
  const schoolYear = getCurrentSchoolYear();

  const studentsQuery = () =>
    buildSchoolFilter(
      supabase.from('students').select('id').eq('provider_id', userId),
      school
    ).limit(1);

  const bellSchedulesQuery = () => {
    let query = supabase
      .from('bell_schedules')
      .select('id')
      .eq('school_year', schoolYear);
    if (school.school_id) {
      query = query.eq('school_id', school.school_id);
    } else {
      // Legacy account with no structured school id: school-wide rows can't
      // be addressed, so fall back to rows this provider created themselves.
      // bell_schedules carries no school_site (its text columns were
      // removed), so this fallback cannot be narrowed further — matching
      // getBellSchedules' own fallback.
      query = query.eq('provider_id', userId);
    }
    return query.limit(1);
  };

  const specialActivitiesQuery = () => {
    let query = supabase
      .from('special_activities')
      .select('id')
      .eq('school_year', schoolYear)
      // The special-activities page hides soft-deleted rows; a deleted row
      // must not check the item while the page renders empty.
      .is('deleted_at', null);
    if (school.school_id) {
      query = query.eq('school_id', school.school_id);
    } else {
      query = query.eq('provider_id', userId);
      // Unlike bell_schedules, this table kept its school_site column — use
      // it so a legacy multi-school provider's rows at another school don't
      // satisfy this school's item.
      if (school.school_site) {
        query = query.eq('school_site', school.school_site);
      }
    }
    return query.limit(1);
  };

  const [students, siteSchedules, bells, activities, unscheduledCount] =
    await Promise.all([
      studentsQuery(),
      supabase
        .from('user_site_schedules')
        .select('id')
        .eq('user_id', userId)
        .limit(1),
      bellSchedulesQuery(),
      specialActivitiesQuery(),
      options.includeUnscheduledCount
        ? getUnscheduledSessionsCount({
            school_id: school.school_id,
            school_site: school.school_site,
            school_district: school.school_district,
          })
        : Promise.resolve(0),
    ]);

  const firstError =
    students.error || siteSchedules.error || bells.error || activities.error;
  if (firstError) throw firstError;

  return {
    hasStudents: (students.data?.length ?? 0) > 0,
    hasSiteSchedules: (siteSchedules.data?.length ?? 0) > 0,
    hasBellSchedules: (bells.data?.length ?? 0) > 0,
    hasSpecialActivities: (activities.data?.length ?? 0) > 0,
    unscheduledCount,
  };
}
