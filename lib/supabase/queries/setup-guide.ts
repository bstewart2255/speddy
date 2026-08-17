import { createClient } from '@/lib/supabase/client';
import {
  buildSchoolFilter,
  isSecondarySchool,
  type SchoolIdentifier,
} from '@/lib/school-helpers';
import { SPECIALIST_SOURCE_ROLES } from '@/lib/auth/role-utils';
import { getCurrentSchoolYear } from '@/lib/school-year';
import type {
  DistrictAdminSetupFacts,
  ProviderSetupFacts,
  SiteAdminSetupFacts,
} from '@/lib/onboarding/setup-guide';
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

  // Same contract as getUnscheduledSessionsCount: with no school_id and an
  // incomplete legacy pair, buildSchoolFilter would silently not filter and
  // every fact would go school-unscoped. Refuse instead — the card hides on
  // error rather than showing another school's checkmarks.
  if (!school.school_id && !(school.school_site && school.school_district)) {
    throw new Error(
      'Incomplete school data: school_id, or both school_site and school_district, are required'
    );
  }

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

/**
 * Existence checks behind the site admin setup guide (SPE-522).
 *
 * All checks are keyed on the admin's granted school_id (admin grants always
 * carry a structured id, so no legacy fallback is needed). Bell schedules and
 * special activities use the same school-wide, current-year semantics as the
 * provider guide above. The provider set is primary profiles UNION
 * provider_schools assignments (the merge getSchoolStaff already does from
 * an admin session), restricted to the seven provider roles — SEAs never own
 * caseload rows, so counting them would pin the item at waiting forever.
 */
export async function getSiteAdminSetupFacts(schoolId: string): Promise<{
  isSecondary: boolean;
  facts: SiteAdminSetupFacts;
}> {
  const supabase = createClient<Database>();
  const schoolYear = getCurrentSchoolYear();

  const [school, teachers, staff, bells, activities, providers, providerSchools] =
    await Promise.all([
      supabase
        .from('schools')
        // grade_span_low alone drives the level split (isSecondarySchool),
        // so it is what "grade span present" means here.
        .select('school_type, grade_span_low')
        .eq('id', schoolId)
        .single(),
      supabase.from('teachers').select('id').eq('school_id', schoolId).limit(1),
      supabase.from('staff').select('id').eq('school_id', schoolId).limit(1),
      supabase
        .from('bell_schedules')
        .select('id')
        .eq('school_id', schoolId)
        .eq('school_year', schoolYear)
        .limit(1),
      supabase
        .from('special_activities')
        .select('id')
        .eq('school_id', schoolId)
        .eq('school_year', schoolYear)
        .is('deleted_at', null)
        .limit(1),
      supabase
        .from('profiles')
        .select('id')
        .eq('school_id', schoolId)
        .in('role', [...SPECIALIST_SOURCE_ROLES]),
      supabase
        .from('provider_schools')
        .select('provider_id')
        .eq('school_id', schoolId),
    ]);

  const firstError =
    school.error ||
    teachers.error ||
    staff.error ||
    bells.error ||
    activities.error ||
    providers.error ||
    providerSchools.error;
  if (firstError) throw firstError;

  // Itinerant providers are assigned here through provider_schools while
  // their primary profiles.school_id points elsewhere — fold them in, role-
  // filtered (provider_schools also carries SEA assignments).
  const primaryIds = (providers.data ?? []).map(p => p.id);
  const assignedIds = [
    ...new Set(
      (providerSchools.data ?? [])
        .map(r => r.provider_id)
        .filter((id): id is string => !!id && !primaryIds.includes(id))
    ),
  ];
  let itinerantIds: string[] = [];
  if (assignedIds.length > 0) {
    const itinerants = await supabase
      .from('profiles')
      .select('id')
      .in('id', assignedIds)
      .in('role', [...SPECIALIST_SOURCE_ROLES]);
    if (itinerants.error) throw itinerants.error;
    itinerantIds = (itinerants.data ?? []).map(p => p.id);
  }

  // One head-check per provider rather than fetching a row per student: the
  // dashboard only needs "does this provider have any student here", and a
  // big school would otherwise ship hundreds of rows per visit.
  const providerIds = [...primaryIds, ...itinerantIds];
  const perProvider = await Promise.all(
    providerIds.map(id =>
      supabase
        .from('students')
        .select('id')
        .eq('school_id', schoolId)
        .eq('provider_id', id)
        .limit(1)
    )
  );
  const perProviderError = perProvider.find(r => r.error)?.error;
  if (perProviderError) throw perProviderError;
  const providersWithStudents = perProvider.filter(
    r => (r.data?.length ?? 0) > 0
  ).length;

  return {
    isSecondary: isSecondarySchool(school.data),
    facts: {
      schoolTypePresent: !!school.data?.school_type?.trim(),
      gradeSpanPresent: !!school.data?.grade_span_low?.trim(),
      hasTeachers: (teachers.data?.length ?? 0) > 0,
      hasStaff: (staff.data?.length ?? 0) > 0,
      hasBellSchedules: (bells.data?.length ?? 0) > 0,
      hasSpecialActivities: (activities.data?.length ?? 0) > 0,
      providerCount: providerIds.length,
      providersWithStudents,
    },
  };
}

/**
 * Existence checks behind the district admin setup guide (SPE-523).
 *
 * district_sis_connections is the column-restricted table (SPE-395): name the
 * columns — `select('*')` fails for browser sessions by design.
 */
export async function getDistrictAdminSetupFacts(
  districtId: string
): Promise<DistrictAdminSetupFacts> {
  const supabase = createClient<Database>();

  const [schools, curriculums, sisConnections] = await Promise.all([
    supabase
      .from('schools')
      .select('id, school_type, grade_span_low')
      .eq('district_id', districtId),
    supabase
      .from('district_curriculums')
      .select('id')
      .eq('district_id', districtId)
      .limit(1),
    supabase
      .from('district_sis_connections')
      .select('status')
      .eq('district_id', districtId),
  ]);

  const firstError =
    schools.error || curriculums.error || sisConnections.error;
  if (firstError) throw firstError;

  const schoolRows = schools.data ?? [];
  const schoolIds = schoolRows.map(s => s.id);

  // Providers by district stamp OR by school — pre-provisioning accounts can
  // carry school_id without district_id, and the site-admin guide counts them
  // by school; the two guides must agree.
  let providersQuery = supabase
    .from('profiles')
    .select('id')
    .in('role', [...SPECIALIST_SOURCE_ROLES]);
  providersQuery =
    schoolIds.length > 0
      ? providersQuery.or(
          `district_id.eq.${districtId},school_id.in.(${schoolIds.join(',')})`
        )
      : providersQuery.eq('district_id', districtId);
  const providers = await providersQuery;
  if (providers.error) throw providers.error;

  // Site-admin coverage per school, from profiles (a site_admin profile at
  // the school implies the grant — the provisioning routes create both).
  let schoolsWithSiteAdmin = 0;
  if (schoolIds.length > 0) {
    const siteAdmins = await supabase
      .from('profiles')
      .select('school_id')
      .eq('role', 'site_admin')
      .in('school_id', schoolIds);
    if (siteAdmins.error) throw siteAdmins.error;
    schoolsWithSiteAdmin = new Set(
      (siteAdmins.data ?? [])
        .map(p => p.school_id)
        .filter((id): id is string => !!id)
    ).size;
  }

  // One connected connection wins; otherwise surface the most actionable
  // remaining state (error beats disabled beats in-progress).
  const statuses = (sisConnections.data ?? []).map(c => c.status);
  const sisStatus: DistrictAdminSetupFacts['sisStatus'] = statuses.includes(
    'connected'
  )
    ? 'connected'
    : statuses.includes('error')
      ? 'error'
      : statuses.includes('disabled')
        ? 'disabled'
        : statuses.length > 0
          ? 'pending'
          : 'none';

  return {
    schoolCount: schoolRows.length,
    schoolsWithFacts: schoolRows.filter(
      s => !!s.school_type?.trim() && !!s.grade_span_low?.trim()
    ).length,
    schoolsWithSiteAdmin,
    providerCount: (providers.data ?? []).length,
    hasCurriculums: (curriculums.data?.length ?? 0) > 0,
    sisStatus,
  };
}
