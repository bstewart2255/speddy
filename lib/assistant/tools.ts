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
 */

export const MAX_SCHEDULE_RANGE_DAYS = 31;
const MAX_SCHEDULE_ROWS = 300;
const MAX_NOTE_CHARS = 500;

export const assistantTools: Anthropic.Tool[] = [
  {
    name: 'get_caseload',
    description:
      "List the signed-in provider's student caseload: student id, initials, name (when recorded), grade, IEP goals, and service level (sessions per week, minutes per session, total weekly minutes). Use this for questions about students, goals, or service minutes, and to find a student_id for get_student_info.",
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_schedule',
    description:
      "List the provider's dated session instances between start_date and end_date (inclusive), each with date, start/end time, student initials and grade, service type, who delivers it, completion status, and any session notes. Dates are YYYY-MM-DD and the range may span at most 31 days. Use for questions about their calendar, a specific day or week, or completed/upcoming sessions.",
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
      'Get one student from the caseload by student_id (find ids via get_caseload): initials, name, grade, IEP goals, service level, and their recurring weekly session slots (day_of_week 1=Monday … 5=Friday).',
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
  first_name?: string | null;
  last_name?: string | null;
  iep_goals?: string[] | string | null;
}

// student_details comes back as an object or a one-element array depending on
// how PostgREST resolves the relationship; normalize both shapes.
function normalizeDetails(raw: unknown): StudentDetailsRow | null {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return (row as StudentDetailsRow) ?? null;
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

function studentName(details: StudentDetailsRow | null): string | null {
  const name = [details?.first_name, details?.last_name].filter(Boolean).join(' ').trim();
  return name || null;
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
    .select('id, initials, grade_level, sessions_per_week, minutes_per_session, student_details(first_name, last_name, iep_goals)')
    .eq('provider_id', userId)
    .order('grade_level', { ascending: true });

  if (error) return { ok: false, error: `Could not load the caseload: ${error.message}` };

  const students = (data ?? []).map((row) => {
    const details = normalizeDetails(row.student_details);
    const sessionsPerWeek = row.sessions_per_week ?? null;
    const minutesPerSession = row.minutes_per_session ?? null;
    return {
      student_id: row.id,
      initials: row.initials,
      name: studentName(details),
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

  const { data, error } = await supabase
    .from('schedule_sessions')
    .select(
      'session_date, start_time, end_time, service_type, delivered_by, is_completed, session_notes, students(initials, grade_level)'
    )
    .eq('provider_id', userId)
    .not('session_date', 'is', null)
    .gte('session_date', range.start)
    .lte('session_date', range.end)
    .is('deleted_at', null)
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(MAX_SCHEDULE_ROWS);

  if (error) return { ok: false, error: `Could not load the schedule: ${error.message}` };

  const sessions = (data ?? []).map((row) => {
    const student = normalizeDetails(row.students) as { initials?: string; grade_level?: string } | null;
    const notes = typeof row.session_notes === 'string' ? row.session_notes : null;
    return {
      date: row.session_date,
      start_time: row.start_time,
      end_time: row.end_time,
      student_initials: student?.initials ?? null,
      student_grade: student?.grade_level ?? null,
      service_type: row.service_type,
      delivered_by: row.delivered_by,
      completed: row.is_completed === true,
      notes: notes && notes.length > MAX_NOTE_CHARS ? `${notes.slice(0, MAX_NOTE_CHARS)}…` : notes,
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

  const { data, error } = await supabase
    .from('students')
    .select('id, initials, grade_level, sessions_per_week, minutes_per_session, student_details(first_name, last_name, iep_goals)')
    .eq('id', studentId)
    .eq('provider_id', userId)
    .maybeSingle();

  if (error) return { ok: false, error: `Could not load the student: ${error.message}` };
  if (!data) return { ok: false, error: 'No student with that id is on your caseload.' };

  const { data: slots, error: slotsError } = await supabase
    .from('schedule_sessions')
    .select('day_of_week, start_time, end_time, service_type')
    .eq('student_id', studentId)
    .eq('provider_id', userId)
    .eq('is_template', true)
    .is('deleted_at', null)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (slotsError) return { ok: false, error: `Could not load the student's schedule: ${slotsError.message}` };

  const details = normalizeDetails(data.student_details);
  const sessionsPerWeek = data.sessions_per_week ?? null;
  const minutesPerSession = data.minutes_per_session ?? null;

  return {
    ok: true,
    data: {
      student_id: data.id,
      initials: data.initials,
      name: studentName(details),
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
