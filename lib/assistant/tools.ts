import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

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
 * limited to the disclosed subprocessor scope — student initials and IEP goal
 * text (plus grade and session times). Full names and free-text session notes
 * are deliberately never selected here; widening this requires a disclosure
 * update first, not just a code change.
 */

export const MAX_SCHEDULE_RANGE_DAYS = 31;
const MAX_SCHEDULE_ROWS = 300;

export const assistantTools: Anthropic.Tool[] = [
  {
    name: 'get_caseload',
    description:
      "List the students whose services the signed-in provider owns (their caseload): student id, initials, grade, IEP goals, and service level (sessions per week, minutes per session, total weekly minutes). Use this for questions about students, goals, or service minutes, and to find a student_id for get_student_info. Students the provider only delivers delegated sessions for are not caseload — they appear in get_schedule instead.",
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_schedule',
    description:
      "List the provider's dated session instances between start_date and end_date (inclusive) — both sessions they own and sessions delegated to them (delegated_to_me: true) — each with date, start/end time, student id/initials/grade, service type, who delivers it, and completion status. Dates are YYYY-MM-DD and the range may span at most 31 days. Use for questions about their calendar, a specific day or week, or completed/upcoming sessions.",
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
      'Get one student the provider works with, by student_id (from get_caseload or get_schedule): initials, grade, IEP goals, service level, and the recurring weekly session slots this provider owns or delivers for them (day_of_week 1=Monday … 5=Friday).',
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
    .select('id, initials, grade_level, sessions_per_week, minutes_per_session, student_details(iep_goals)')
    .eq('provider_id', userId)
    .order('grade_level', { ascending: true });

  if (error) return { ok: false, error: `Could not load the caseload: ${error.message}` };

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
      'session_date, start_time, end_time, service_type, delivered_by, is_completed, provider_id, student_id, students(initials, grade_level)'
    )
    .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId}`)
    .not('session_date', 'is', null)
    .gte('session_date', range.start)
    .lte('session_date', range.end)
    .is('deleted_at', null)
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(MAX_SCHEDULE_ROWS);

  if (error) return { ok: false, error: `Could not load the schedule: ${error.message}` };

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
  // would wrongly refuse them.
  const { data, error } = await supabase
    .from('students')
    .select('id, initials, grade_level, sessions_per_week, minutes_per_session, student_details(iep_goals)')
    .eq('id', studentId)
    .maybeSingle();

  if (error) return { ok: false, error: `Could not load the student: ${error.message}` };
  if (!data) return { ok: false, error: 'No student with that id is visible to you.' };

  const { data: slots, error: slotsError } = await supabase
    .from('schedule_sessions')
    .select('day_of_week, start_time, end_time, service_type')
    .eq('student_id', studentId)
    .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId}`)
    .eq('is_template', true)
    .is('deleted_at', null)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (slotsError) return { ok: false, error: `Could not load the student's schedule: ${slotsError.message}` };

  const details = normalizeRelation<StudentDetailsRow>(data.student_details);
  const sessionsPerWeek = data.sessions_per_week ?? null;
  const minutesPerSession = data.minutes_per_session ?? null;

  return {
    ok: true,
    data: {
      student_id: data.id,
      initials: data.initials,
      grade: data.grade_level,
      sessions_per_week: sessionsPerWeek,
      minutes_per_session: minutesPerSession,
      weekly_minutes:
        sessionsPerWeek != null && minutesPerSession != null ? sessionsPerWeek * minutesPerSession : null,
      iep_goals: normalizeGoals(details?.iep_goals),
      weekly_slots: (slots ?? []).map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        service_type: s.service_type,
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
    return {
      ok: false,
      error: `Tool failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}
