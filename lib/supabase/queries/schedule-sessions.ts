import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { formatDateLocal } from '@/lib/utils/date-helpers';
import type { Database } from '../../../src/types/database';
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';

/**
 * SPE-294: delete a template's FUTURE, not-yet-completed, UNMARKED dated instances.
 *
 * Every active scheduled template carries up to 12 weeks of pre-materialized
 * future instances (the SPE-291 rolling top-up). Whenever a template stops being
 * live at its current slot — a move (its old-slot rows), unschedule, archive, or
 * a per-template caseload decrease — those rows must go, or each becomes a
 * phantom "unmarked session" in the attendance widget (`/api/attendance/summary`)
 * once its date passes.
 *
 * "Strandable" = `session_date >= today` AND `completed_at IS NULL` AND has NO
 * row in `attendance`. Attendance lives in a separate table joined by session id
 * with an ON DELETE CASCADE FK, so deleting a marked instance would destroy its
 * present/absent record — a compliance record. Those are preserved here, as is
 * all past and explicitly-completed history. Accepts one template id or many
 * (e.g. clearing a day). Reads the candidate ids up front (paginated, since
 * clearing a busy day can exceed PostgREST's 1000-row cap) then deletes in
 * chunks; PostgREST can't express the attendance anti-join inline. RLS scopes
 * both the attendance read and the delete to the caller.
 */
export async function deleteFutureTemplateInstances(
  supabase: SupabaseClient<Database>,
  templateIds: string | string[]
): Promise<{ deleted: number; error: PostgrestError | null }> {
  const ids = Array.isArray(templateIds) ? templateIds : [templateIds];
  if (ids.length === 0) return { deleted: 0, error: null };

  const today = formatDateLocal(new Date());

  // Collect candidates: each template's future, not-explicitly-completed
  // instances. Paginate (PostgREST caps a single response at 1000 rows, and
  // templates now generate through the school year end) and read every id
  // before deleting anything, so the scan isn't disturbed mid-pass.
  const PAGE = 1000;
  const candidateIds: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('schedule_sessions')
      .select('id')
      .in('template_id', ids)
      .gte('session_date', today)
      .is('completed_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { deleted: 0, error };
    const batch = data ?? [];
    for (const row of batch) candidateIds.push(row.id);
    if (batch.length < PAGE) break;
  }
  if (candidateIds.length === 0) return { deleted: 0, error: null };

  // Delete in chunks, preserving any instance that already has recorded
  // attendance — the ON DELETE CASCADE FK would otherwise destroy that
  // present/absent record. Chunking also bounds the `.in(...)` URL length.
  const CHUNK = 200;
  let deleted = 0;
  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const chunk = candidateIds.slice(i, i + CHUNK);

    const { data: marked, error: attErr } = await supabase
      .from('attendance')
      .select('session_id')
      .in('session_id', chunk);
    if (attErr) return { deleted, error: attErr };

    const markedIds = new Set((marked ?? []).map((m) => m.session_id));
    const deletableIds = chunk.filter((id) => !markedIds.has(id));
    if (deletableIds.length === 0) continue;

    const { count, error } = await supabase
      .from('schedule_sessions')
      .delete({ count: 'exact' })
      .in('id', deletableIds);
    if (error) return { deleted, error };
    deleted += count ?? 0;
  }

  return { deleted, error: null };
}

/**
 * Removes a schedule_sessions row while preserving instance history.
 *
 * - A dated instance the user explicitly removed is hard-deleted.
 * - A template's FUTURE, not-yet-completed instances are pruned first (SPE-294),
 *   so the top-up's future rows don't linger as phantom "unmarked" sessions.
 * - The template is then soft-deleted (deleted_at set) iff past/completed history
 *   remains — keeping a valid template_id for it — else hard-deleted.
 *
 * Template reads must filter `.is('deleted_at', null)` so archived templates stay
 * out of the schedule grid, count math, conflict checks, and instance generation.
 */
export async function deleteOrArchiveTemplate(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<{ archived: boolean; error: PostgrestError | Error | null }> {
  const { data: row, error: fetchError } = await supabase
    .from('schedule_sessions')
    .select('id, session_date')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) return { archived: false, error: fetchError };
  if (!row) return { archived: false, error: new Error(`Session ${sessionId} not found`) };

  // A dated instance is removed outright; history preservation is about template lineage.
  if (row.session_date !== null) {
    const { error } = await supabase.from('schedule_sessions').delete().eq('id', sessionId);
    return { archived: false, error };
  }

  // Prune this template's future, not-yet-completed instances (SPE-294) before
  // deciding archive vs hard-delete, so the archive decision is based on the
  // history actually worth keeping.
  const { error: pruneError } = await deleteFutureTemplateInstances(supabase, sessionId);
  if (pruneError) return { archived: false, error: pruneError };

  // Archive only if past/completed history remains after the prune.
  const { count, error: countError } = await supabase
    .from('schedule_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', sessionId);

  if (countError) return { archived: false, error: countError };

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from('schedule_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId);
    return { archived: true, error };
  }

  const { error } = await supabase.from('schedule_sessions').delete().eq('id', sessionId);
  return { archived: false, error };
}

/**
 * Calculate how many sessions still need to be scheduled this week.
 *
 * Combines the required sessions_per_week for each student with the number of
 * sessions already scheduled to return the remaining count.
 *
 * @param school - School information for filtering. district_id is included for
 *                 type compatibility with school objects but is not used in filtering.
 *                 School identification uses either school_id (normalized) or the
 *                 combination of school_site + school_district (legacy).
 */
export async function getUnscheduledSessionsCount(
  school: {
    school_id?: string | null;
    district_id?: string | null; // Included for type compatibility, not used in filtering
    school_site?: string | null;
    school_district?: string | null;
  } | null
) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    async () => supabase.auth.getUser(),
    { operation: 'get_user_for_unscheduled_count' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;

  // Get all students and their requirements for the current school
  const studentsPerf = measurePerformanceWithAlerts('fetch_students_for_unscheduled_count', 'database');
  const studentsResult = await safeQuery(
    async () => {
      let studentsQuery = supabase
        .from('students')
        .select('id, sessions_per_week')
        .eq('provider_id', user.id);

      // Filter by school using normalized fields (school_id) if available,
      // otherwise fall back to legacy fields (school_site + school_district)
      if (school) {
        if (school.school_id) {
          studentsQuery = studentsQuery.eq('school_id', school.school_id);
        } else if (school.school_site && school.school_district) {
          // Legacy schools without school_id
          studentsQuery = studentsQuery
            .eq('school_site', school.school_site)
            .eq('school_district', school.school_district);
        } else if (school.school_site || school.school_district) {
          // Incomplete school data - don't filter to prevent incorrect results
          console.warn('[getUnscheduledSessionsCount] Incomplete school data provided:', {
            school_id: school.school_id,
            school_site: school.school_site,
            school_district: school.school_district
          });
          throw new Error('Incomplete school data: both school_site and school_district are required when school_id is not available');
        }
      }

      const { data, error } = await studentsQuery;
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_students_for_unscheduled_count',
      userId: user.id,
      schoolId: school?.school_id,
      schoolSite: school?.school_site
    }
  );
  studentsPerf.end({ success: !studentsResult.error });

  if (studentsResult.error) throw studentsResult.error;

  const students = studentsResult.data || [];
  if (!Array.isArray(students) || students.length === 0) return 0;

  // Get student IDs from the already-filtered students list
  const studentIds = students.map(s => s.id);

  // Get current UNSCHEDULED sessions (day_of_week, start_time, end_time are null)
  // IMPORTANT: Only count template/unscheduled sessions (session_date IS NULL), not dated instances
  // Dated instances with null day/time are historical records, not sessions that need scheduling
  const sessionsPerf = measurePerformanceWithAlerts('fetch_unscheduled_sessions_count', 'database');
  const sessionsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select('id')
        .in('student_id', studentIds)
        .is('session_date', null) // Only templates/unscheduled, not dated instances
        .is('deleted_at', null)
        .is('day_of_week', null)
        .is('start_time', null)
        .is('end_time', null);
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_unscheduled_sessions_count',
      userId: user.id,
      schoolId: school?.school_id,
      schoolSite: school?.school_site
    }
  );
  sessionsPerf.end({ success: !sessionsResult.error });

  if (sessionsResult.error) throw sessionsResult.error;

  const unscheduledSessions = sessionsResult.data || [];

  // Return the count of actual unscheduled sessions
  return Array.isArray(unscheduledSessions) ? unscheduledSessions.length : 0;
}