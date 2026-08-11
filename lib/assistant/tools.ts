import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/monitoring/logger';

/**
 * Read-only tools the Speddy Assistant can call (SPE-450).
 *
 * Every executor queries through the caller's RLS-scoped Supabase client and
 * additionally pins `provider_id` to the signed-in user, so the assistant
 * answers strictly about the user's own caseload and schedule — it can never
 * read rows the signed-in user couldn't read themselves, and it has no write
 * path at all.
 *
 * Student-data scope (CA-NDPA, see SPE-61 / `lib/lessons/student-labels.ts`):
 * what these tools return is sent to Anthropic as tool results, so they are
 * limited to the disclosed subprocessor scope — student initials, IEP goal
 * text, IEP/triennial meeting dates, grade, session times, and session group
 * labels. Full names and free-text session notes are deliberately never
 * selected here; widening this requires a disclosure update in
 * `docs/subprocessors.md` in the same PR, not just a code change.
 */

export const MAX_SCHEDULE_RANGE_DAYS = 31;
const MAX_SCHEDULE_ROWS = 300;

export const assistantTools: Anthropic.Tool[] = [
  {
    name: 'get_caseload',
    description:
      "List the students whose services the signed-in provider owns (their caseload): student id, initials, grade, IEP goals, upcoming annual IEP meeting date and triennial review date (if recorded), and service level (sessions per week, minutes per session, total weekly minutes). Note: dates written inside goal text are goal target dates, not IEP meeting dates. Use this for questions about students, goals, IEP dates, or service minutes, and to find a student_id for get_student_info. Students the provider only delivers delegated sessions for are not caseload — they appear in get_schedule instead.",
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_schedule',
    description:
      "List the provider's dated session instances between start_date and end_date (inclusive) — both sessions they own and sessions delegated to them (delegated_to_me: true) — each with date, start/end time, student id/initials/grade, service type, group name (if the session belongs to a named group; students sharing the same time slot are seen together as a group either way), who delivers it, and completion status. Dates are YYYY-MM-DD and the range may span at most 31 days. Use for questions about their calendar, a specific day or week, groups, or completed/upcoming sessions.",
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'First date of the range, YYYY-MM-DD',
        },
        end_date: {
          type: 'string',
          description: 'Last date of the range, YYYY-MM-DD',
        },
      },
      required: ['start_date', 'end_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_student_info',
    description:
      "Get one student the provider works with, by student_id (from get_caseload or get_schedule): initials, grade, IEP goals, upcoming annual IEP meeting date and triennial review date (if recorded), service level, and the recurring weekly session slots this provider owns or delivers for them (day_of_week 1=Monday … 5=Friday), each with its group name if the slot is part of a named group. When on_my_caseload is false (a student only delegated to this provider), IEP goals and meeting dates are held by the caseload owner and are not visible here — say that, never that they are missing.",
    input_schema: {
      type: 'object',
      properties: {
        student_id: {
          type: 'string',
          description: 'The student id, as returned by get_caseload',
        },
      },
      required: ['student_id'],
      additionalProperties: false,
    },
  },
];

export type AssistantToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StudentDetailsRow {
  iep_goals?: string[] | string | null;
  upcoming_iep_date?: string | null;
  upcoming_triennial_date?: string | null;
}

// Relationship columns come back as an object or a one-element array depending
// on how PostgREST resolves them; normalize both shapes.
function normalizeRelation<T>(raw: unknown): T | null {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return (row as T) ?? null;
}

function normalizeGoals(goals: StudentDetailsRow['iep_goals']): string[] {
  if (!goals) return [];
  if (Array.isArray(goals)) {
    return goals.filter((g): g is string => typeof g === 'string' && g.trim().length > 0);
  }
  if (typeof goals === 'string' && goals.trim()) {
    return goals.includes(';') ? goals.split(';').map((g) => g.trim()).filter(Boolean) : [goals];
  }
  return [];
}

function parseDateRange(input: Record<string, unknown>):
  | { ok: true; start: string; end: string }
  | { ok: false; error: string } {
  const start = input.start_date;
  const end = input.end_date;
  if (typeof start !== 'string' || !DATE_RE.test(start) || typeof end !== 'string' || !DATE_RE.test(end)) {
    return { ok: false, error: 'start_date and end_date must be YYYY-MM-DD strings.' };
  }
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { ok: false, error: 'start_date or end_date is not a real calendar date.' };
  }
  if (endMs < startMs) {
    return { ok: false, error: 'end_date must be on or after start_date.' };
  }
  const days = (endMs - startMs) / 86_400_000 + 1;
  if (days > MAX_SCHEDULE_RANGE_DAYS) {
    return { ok: false, error: `Date range too large — ask for at most ${MAX_SCHEDULE_RANGE_DAYS} days at a time.` };
  }
  return { ok: true, start, end };
}

async function getCaseload(supabase: SupabaseClient, userId: string): Promise<AssistantToolResult> {
  const { data, error } = await supabase
    .from('students')
    .select(
      'id, initials, grade_level, sessions_per_week, minutes_per_session, student_details(iep_goals, upcoming_iep_date, upcoming_triennial_date)'
    )
    .eq('provider_id', userId)
    .order('grade_level', { ascending: true });

  // DB error text can carry schema details and would reach the model (and
  // potentially the browser) as a tool result — log it, return a fixed message.
  if (error) {
    log.error('Assistant tool get_caseload failed', error, { userId });
    return { ok: false, error: 'Could not load the caseload right now.' };
  }

  const students = (data ?? []).map((row) => {
    const details = normalizeRelation<StudentDetailsRow>(row.student_details);
    const sessionsPerWeek = row.sessions_per_week ?? null;
    const minutesPerSession = row.minutes_per_session ?? null;
    return {
      student_id: row.id,
      initials: row.initials,
      grade: row.grade_level,
      sessions_per_week: sessionsPerWeek,
      minutes_per_session: minutesPerSession,
      weekly_minutes:
        sessionsPerWeek != null && minutesPerSession != null ? sessionsPerWeek * minutesPerSession : null,
      iep_goals: normalizeGoals(details?.iep_goals),
      upcoming_iep_date: details?.upcoming_iep_date ?? null,
      upcoming_triennial_date: details?.upcoming_triennial_date ?? null,
    };
  });

  return { ok: true, data: { student_count: students.length, students } };
}

async function getSchedule(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>
): Promise<AssistantToolResult> {
  const range = parseDateRange(input);
  if (!range.ok) return range;

  // Owned sessions plus sessions delegated to this user — the same access
  // paths the schedule surface uses (use-schedule-data.ts), so the assistant's
  // answer matches the calendar an assigned specialist actually sees.
  const { data, error } = await supabase
    .from('schedule_sessions')
    .select(
      'session_date, start_time, end_time, service_type, delivered_by, is_completed, provider_id, student_id, group_name, students(initials, grade_level)'
    )
    .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId}`)
    .not('session_date', 'is', null)
    .gte('session_date', range.start)
    .lte('session_date', range.end)
    .is('deleted_at', null)
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(MAX_SCHEDULE_ROWS);

  if (error) {
    log.error('Assistant tool get_schedule failed', error, { userId });
    return { ok: false, error: 'Could not load the schedule right now.' };
  }

  const sessions = (data ?? []).map((row) => {
    const student = normalizeRelation<{ initials?: string; grade_level?: string }>(row.students);
    return {
      date: row.session_date,
      start_time: row.start_time,
      end_time: row.end_time,
      student_id: row.student_id,
      student_initials: student?.initials ?? null,
      student_grade: student?.grade_level ?? null,
      service_type: row.service_type,
      group_name: row.group_name ?? null,
      delivered_by: row.delivered_by,
      delegated_to_me: row.provider_id !== userId,
      completed: row.is_completed === true,
    };
  });

  return {
    ok: true,
    data: {
      start_date: range.start,
      end_date: range.end,
      session_count: sessions.length,
      truncated: sessions.length === MAX_SCHEDULE_ROWS,
      sessions,
    },
  };
}

async function getStudentInfo(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>
): Promise<AssistantToolResult> {
  const studentId = input.student_id;
  if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
    return { ok: false, error: 'student_id must be an id returned by get_caseload.' };
  }

  // No provider_id pin here: RLS already scopes reads to students this user
  // works with (owned caseload OR assigned via delegated sessions), and the
  // schedule surface exposes delegated students too — pinning to ownership
  // would wrongly refuse them. provider_id is selected only to compute
  // on_my_caseload below; it is never emitted to the model.
  // Note (verified against live pg_policies): student_details' SELECT policy
  // covers owner/SEA/teacher paths but NOT delegated specialists, so for a
  // delegated student the details join comes back empty — on_my_caseload lets
  // the model report "held by the caseload owner" instead of "missing".
  const { data, error } = await supabase
    .from('students')
    .select(
      'id, initials, grade_level, sessions_per_week, minutes_per_session, provider_id, student_details(iep_goals, upcoming_iep_date, upcoming_triennial_date)'
    )
    .eq('id', studentId)
    .maybeSingle();

  if (error) {
    log.error('Assistant tool get_student_info failed', error, { userId });
    return { ok: false, error: 'Could not load the student right now.' };
  }
  if (!data) return { ok: false, error: 'No student with that id is visible to you.' };

  const { data: slots, error: slotsError } = await supabase
    .from('schedule_sessions')
    .select('day_of_week, start_time, end_time, service_type, group_name')
    .eq('student_id', studentId)
    .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId}`)
    .eq('is_template', true)
    .is('deleted_at', null)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (slotsError) {
    log.error('Assistant tool get_student_info slots failed', slotsError, { userId });
    return { ok: false, error: "Could not load the student's schedule right now." };
  }

  const details = normalizeRelation<StudentDetailsRow>(data.student_details);
  const sessionsPerWeek = data.sessions_per_week ?? null;
  const minutesPerSession = data.minutes_per_session ?? null;

  return {
    ok: true,
    data: {
      student_id: data.id,
      initials: data.initials,
      grade: data.grade_level,
      on_my_caseload: data.provider_id === userId,
      sessions_per_week: sessionsPerWeek,
      minutes_per_session: minutesPerSession,
      weekly_minutes:
        sessionsPerWeek != null && minutesPerSession != null ? sessionsPerWeek * minutesPerSession : null,
      iep_goals: normalizeGoals(details?.iep_goals),
      upcoming_iep_date: details?.upcoming_iep_date ?? null,
      upcoming_triennial_date: details?.upcoming_triennial_date ?? null,
      weekly_slots: (slots ?? []).map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        service_type: s.service_type,
        group_name: s.group_name ?? null,
      })),
    },
  };
}

export async function executeAssistantTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  input: Record<string, unknown>
): Promise<AssistantToolResult> {
  try {
    switch (name) {
      case 'get_caseload':
        return await getCaseload(supabase, userId);
      case 'get_schedule':
        return await getSchedule(supabase, userId, input);
      case 'get_student_info':
        return await getStudentInfo(supabase, userId, input);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    log.error('Assistant tool threw', err, { userId, tool: name });
    return { ok: false, error: 'The tool failed unexpectedly — try again or ask differently.' };
  }
}
