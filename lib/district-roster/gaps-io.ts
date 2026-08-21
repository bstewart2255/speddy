/**
 * Reading what the roster gaps view needs (SPE-587).
 *
 * SERVICE CLIENT ON PURPOSE, for the same reason the import uses one: a child
 * nobody serves is invisible through RLS by construction (`children_select` is
 * an EXISTS over `students`), so the unserved students this whole view is about
 * cannot be read any other way — and `students_select` has no district-admin
 * branch at all. Authorization is decided ONCE, at the route, by
 * `requireDistrictAdmin`; every read below is already scoped to the district
 * that gate returned and can never be pointed at another one.
 *
 * Which children belong to the district is NOT re-derived here. It comes from
 * `loadDistrictChildRows`, the same function the import's matcher reads through,
 * so the two surfaces cannot disagree about who is on the roster.
 */

import { createServiceClient } from '@/lib/supabase/server';
import {
  loadCaseloadCounts,
  loadDistrictChildRows,
  loadDistrictSchools,
} from './roster-import';
import { planRosterGaps, type GapStaffInput, type RosterGaps } from './gaps';

/** `.in()` filters ride in the request URL — chunked so ids can't overflow it. */
const IN_CHUNK = 100;

/** PostgREST caps a select at max_rows, so every read below pages to the end. */
const DB_PAGE = 1000;

function chunked<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/** Only what the view shows — the roster's jsonb columns are never read here. */
const GAP_CHILD_COLUMNS =
  'id, first_name, last_name, initials, grade_level, school_id, case_manager';

/**
 * Every staff account a case-manager name could refer to.
 *
 * Three reads, because no single column answers "works in this district":
 *
 *   1. `profiles.district_id` — the intended answer, and the only one for most
 *      accounts.
 *   2. Accounts sitting at one of the district's schools with NO district
 *      recorded. SPE-570 left 116 production profiles in exactly that state,
 *      and skipping them would report a real provider as having no account.
 *   3. Anyone linked to one of the district's schools through
 *      `provider_schools`. A provider who works across two districts carries
 *      one district on their profile, but they can claim at any school they are
 *      attached to — which is the question this view actually asks.
 *
 * Deduped by id. Read 2 is filtered to `district_id IS NULL` for the same
 * reason the child loader is: an account belonging to ANOTHER district that
 * happens to sit at a shared campus is that district's, not this one's.
 */
async function loadDistrictStaff(
  districtId: string,
  schoolIds: string[],
): Promise<GapStaffInput[]> {
  const supabase = createServiceClient();
  const byId = new Map<string, GapStaffInput>();

  const collect = (
    rows: { id: unknown; full_name?: unknown; role?: unknown; school_id?: unknown }[],
  ) => {
    for (const row of rows) {
      const id = String(row.id);
      if (byId.has(id)) continue;
      const ownSchool = row.school_id === null ? null : String(row.school_id ?? '') || null;
      byId.set(id, {
        id,
        fullName: (row.full_name as string | null) ?? null,
        role: (row.role as string | null) ?? null,
        schoolIds: ownSchool ? [ownSchool] : [],
      });
    }
  };

  // Each read is keyset paged and written out in full rather than through a
  // shared helper: PostgREST's builder type does not survive being passed
  // around, and the `any`-shaped helper that would take it can hide a dropped
  // filter — which here means reading another district's staff. An offset page
  // could also skip a row inserted mid-read, and a provider this loader misses
  // is a provider the view wrongly reports as having no Speddy account.
  for (let afterId: string | null = null; ; ) {
    const q = supabase
      .from('profiles')
      .select('id, full_name, role, school_id')
      .eq('district_id', districtId);
    const { data, error } = await (afterId === null ? q : q.gt('id', afterId))
      .order('id')
      .limit(DB_PAGE);
    if (error) throw new Error(`Could not load this district's staff: ${error.message}`);
    collect(data ?? []);
    if (!data || data.length < DB_PAGE) break;
    afterId = String(data[data.length - 1].id);
  }

  for (const chunk of chunked(schoolIds, IN_CHUNK)) {
    for (let afterId: string | null = null; ; ) {
      const q = supabase
        .from('profiles')
        .select('id, full_name, role, school_id')
        .in('school_id', chunk)
        .is('district_id', null);
      const { data, error } = await (afterId === null ? q : q.gt('id', afterId))
        .order('id')
        .limit(DB_PAGE);
      if (error) throw new Error(`Could not load this district's staff: ${error.message}`);
      collect(data ?? []);
      if (!data || data.length < DB_PAGE) break;
      afterId = String(data[data.length - 1].id);
    }
  }

  // Which district schools each account is attached to through provider_schools.
  // This is half of "where can they claim?" — the other half is their profile's
  // own school, collected above — and it decides whether a case manager who IS a
  // provider can actually reach the student, or is sitting on another campus.
  //
  // Ids come back first, then any profile not already loaded: a nested select
  // would depend on a FK relationship name PostgREST infers, which is one more
  // thing to get wrong.
  const schoolIdsByProvider = new Map<string, Set<string>>();
  for (const chunk of chunked(schoolIds, IN_CHUNK)) {
    for (let afterId: string | null = null; ; ) {
      const q = supabase
        .from('provider_schools')
        .select('id, provider_id, school_id')
        .in('school_id', chunk);
      const { data, error } = await (afterId === null ? q : q.gt('id', afterId))
        .order('id')
        .limit(DB_PAGE);
      if (error) throw new Error(`Could not load school assignments: ${error.message}`);
      for (const row of data ?? []) {
        const providerId = row.provider_id === null ? '' : String(row.provider_id);
        const schoolId = row.school_id === null ? '' : String(row.school_id);
        if (providerId === '' || schoolId === '') continue;
        const seen = schoolIdsByProvider.get(providerId);
        if (seen) seen.add(schoolId);
        else schoolIdsByProvider.set(providerId, new Set([schoolId]));
      }
      if (!data || data.length < DB_PAGE) break;
      afterId = String(data[data.length - 1].id);
    }
  }

  const missing = [...schoolIdsByProvider.keys()].filter((id) => !byId.has(id));
  for (const chunk of chunked(missing, IN_CHUNK)) {
    for (let afterId: string | null = null; ; ) {
      const q = supabase.from('profiles').select('id, full_name, role, school_id').in('id', chunk);
      const { data, error } = await (afterId === null ? q : q.gt('id', afterId))
        .order('id')
        .limit(DB_PAGE);
      if (error) throw new Error(`Could not load this district's staff: ${error.message}`);
      collect(data ?? []);
      if (!data || data.length < DB_PAGE) break;
      afterId = String(data[data.length - 1].id);
    }
  }

  for (const [providerId, linked] of schoolIdsByProvider) {
    const member = byId.get(providerId);
    if (!member) continue;
    member.schoolIds = [...new Set([...member.schoolIds, ...linked])];
  }

  return [...byId.values()];
}

/** When the district last published a roster, or null if it never has. */
export async function loadLastPublishedAt(districtId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('timestamp')
    .eq('action', 'district_roster_imported')
    .eq('resource_id', districtId)
    .order('timestamp', { ascending: false })
    .limit(1);
  // Never the news. The gaps themselves are what the page is for, and a missing
  // "last published" line is a far better outcome than an empty page.
  if (error) return null;
  const timestamp = data?.[0]?.timestamp;
  return typeof timestamp === 'string' ? timestamp : null;
}

/** The whole view, computed fresh: nothing about it is stored between requests. */
export async function loadRosterGaps(districtId: string): Promise<RosterGaps> {
  const schools = await loadDistrictSchools(districtId);
  const schoolIds = schools.map((s) => s.id);

  const [rows, staff] = await Promise.all([
    loadDistrictChildRows(districtId, schoolIds, GAP_CHILD_COLUMNS),
    loadDistrictStaff(districtId, schoolIds),
  ]);

  const counts = await loadCaseloadCounts(rows.map((row) => String(row.id)));

  return planRosterGaps({
    children: rows.map((row) => ({
      id: String(row.id),
      firstName: (row.first_name as string | null) ?? null,
      lastName: (row.last_name as string | null) ?? null,
      initials: String(row.initials ?? ''),
      gradeLevel: (row.grade_level as string | null) ?? null,
      schoolId: (row.school_id as string | null) ?? null,
      caseManager: (row.case_manager as string | null) ?? null,
      caseloadCount: counts.get(String(row.id)) ?? 0,
    })),
    staff,
    schoolNamesById: Object.fromEntries(schools.map((s) => [s.id, s.name])),
  });
}
