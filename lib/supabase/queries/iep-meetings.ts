import { createClient } from '@/lib/supabase/client';
import type { Database, IepMeeting } from '@/src/types';
import { getCurrentSchoolYear } from '@/lib/school-year';
import {
  timeToMinutes,
  type AttendeeConstraints,
  type BusyBlock,
  type DayWindow,
  type DateRange,
  type ProposedSlot,
  type SiteConstraints,
} from '@/lib/iep-meetings/availability';
import type { SiteMeetingRules } from '@/src/types';

export interface MeetingListItem extends IepMeeting {
  students: { initials: string; grade_level: string } | null;
  iep_meeting_attendees: {
    id: string;
    attendee_role: string;
    rsvp_status: string;
    display_name: string | null;
    profile_id: string | null;
  }[];
}

export interface CaseloadStudent {
  id: string;
  initials: string;
  grade_level: string;
  teacher_id: string | null;
  teacherName: string | null;
  teacherProfileId: string | null;
  dueDate: string | null; // earlier of upcoming IEP / triennial
  meetingType: 'annual' | 'triennial';
  hasUpcomingMeeting: boolean;
}

export interface PlanningData {
  caseload: CaseloadStudent[];
  site: SiteConstraints;
  hasSiteRules: boolean;
  organizerBusy: BusyBlock[];
  teacherConstraints: Map<string, AttendeeConstraints>; // by teacher profile id
  existingMeetings: { date: string; start_minutes: number; end_minutes: number }[];
  leaRep: { admin_id: string; full_name: string } | null;
}

/**
 * Meetings this user organizes at one school, soonest first
 * (cancelled/deleted excluded). School-scoped so itinerant providers see
 * only the active school's meetings.
 */
export async function getMyMeetings(
  schoolId: string
): Promise<MeetingListItem[]> {
  const supabase = createClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('iep_meetings')
    .select(
      '*, students(initials, grade_level), iep_meeting_attendees(id, attendee_role, rsvp_status, display_name, profile_id)'
    )
    .eq('organizer_id', user.id)
    .eq('school_id', schoolId)
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .gte('scheduled_start', new Date().toISOString())
    .order('scheduled_start', { ascending: true });

  if (error) {
    console.error('Error fetching meetings:', error);
    throw error;
  }
  return (data ?? []) as MeetingListItem[];
}

function toLocalParts(timestamp: string): {
  date: string;
  start_minutes: number;
} {
  const d = new Date(timestamp);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date, start_minutes: d.getHours() * 60 + d.getMinutes() };
}

/** Everything the planner needs for one school, in one assembly pass. */
export async function getPlanningData(schoolId: string): Promise<PlanningData> {
  const supabase = createClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const [rulesRes, studentsRes, sessionsRes, meetingsRes, adminsRes] =
    await Promise.all([
      supabase
        .from('site_meeting_rules')
        .select('*')
        .eq('school_id', schoolId)
        .maybeSingle(),
      supabase
        .from('students')
        .select(
          'id, initials, grade_level, teacher_id, teachers(id, account_id, first_name, last_name), student_details(upcoming_iep_date, upcoming_triennial_date)'
        )
        .eq('provider_id', user.id)
        .eq('school_id', schoolId),
      supabase
        .from('schedule_sessions')
        .select('day_of_week, start_time, end_time')
        .eq('provider_id', user.id)
        .is('deleted_at', null)
        .not('day_of_week', 'is', null),
      supabase
        .from('iep_meetings')
        .select('id, student_id, scheduled_start, scheduled_end, status')
        .eq('school_id', schoolId)
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .not('scheduled_start', 'is', null),
      supabase.rpc('get_school_site_admins', { p_school_id: schoolId }),
    ]);

  // Every source feeds planning constraints — a silently-failed fetch would
  // produce a plan that looks valid but ignores real conflicts.
  const failures: [string, unknown][] = [
    ['caseload', studentsRes.error],
    ['site rules', rulesRes.error],
    ['sessions', sessionsRes.error],
    ['meetings', meetingsRes.error],
    ['site admins', adminsRes.error],
  ];
  for (const [what, err] of failures) {
    if (err) {
      console.error(`Error fetching ${what}:`, err);
      throw err;
    }
  }

  const rules = rulesRes.data as SiteMeetingRules | null;
  const site: SiteConstraints = {
    windows: ((rules?.allowed_windows ?? []) as unknown as DayWindow[]) || [],
    blackouts: ((rules?.blackout_ranges ?? []) as unknown as DateRange[]) || [],
    maxMeetingsPerDay: rules?.max_meetings_per_day ?? null,
  };

  const organizerBusy: BusyBlock[] = (sessionsRes.data ?? [])
    .filter(s => s.start_time && s.end_time)
    .map(s => ({
      day_of_week: s.day_of_week as number,
      start_minutes: timeToMinutes(s.start_time as string),
      end_minutes: timeToMinutes(s.end_time as string),
      source: 'session',
      label: 'Session',
    }));

  const existingMeetings = (meetingsRes.data ?? []).map(m => {
    const start = toLocalParts(m.scheduled_start as string);
    const end = m.scheduled_end
      ? toLocalParts(m.scheduled_end as string)
      : { start_minutes: start.start_minutes + 60 };
    return {
      date: start.date,
      start_minutes: start.start_minutes,
      end_minutes: end.start_minutes,
    };
  });

  const now = Date.now();
  const studentsWithMeetings = new Set(
    (meetingsRes.data ?? [])
      .filter(m => new Date(m.scheduled_start as string).getTime() >= now)
      .map(m => m.student_id)
  );

  type StudentRow = {
    id: string;
    initials: string;
    grade_level: string;
    teacher_id: string | null;
    teachers: {
      id: string;
      account_id: string | null;
      first_name: string | null;
      last_name: string | null;
    } | null;
    student_details: {
      upcoming_iep_date: string | null;
      upcoming_triennial_date: string | null;
    } | null;
  };

  const caseload: CaseloadStudent[] = ((studentsRes.data ?? []) as unknown as StudentRow[]).map(s => {
    const details = Array.isArray(s.student_details)
      ? s.student_details[0]
      : s.student_details;
    const iepDue = details?.upcoming_iep_date ?? null;
    const triDue = details?.upcoming_triennial_date ?? null;
    // Authoritative deadlines (spec §10): earlier of the two decides the
    // next meeting and its type.
    let dueDate = iepDue;
    let meetingType: 'annual' | 'triennial' = 'annual';
    if (triDue && (!iepDue || triDue <= iepDue)) {
      dueDate = triDue;
      meetingType = 'triennial';
    }
    const teacher = Array.isArray(s.teachers) ? s.teachers[0] : s.teachers;
    return {
      id: s.id,
      initials: s.initials,
      grade_level: s.grade_level,
      teacher_id: s.teacher_id,
      teacherName: teacher
        ? [teacher.first_name, teacher.last_name].filter(Boolean).join(' ') || null
        : null,
      teacherProfileId: teacher?.account_id ?? null,
      dueDate,
      meetingType,
      hasUpcomingMeeting: studentsWithMeetings.has(s.id),
    };
  });

  // Teacher availability prefs → engine constraints, by teacher profile id
  const teacherProfileIds = Array.from(
    new Set(caseload.map(s => s.teacherProfileId).filter(Boolean))
  ) as string[];
  const teacherConstraints = new Map<string, AttendeeConstraints>();
  if (teacherProfileIds.length > 0) {
    const { data: prefs, error: prefsError } = await supabase
      .from('teacher_availability_prefs')
      .select('*')
      .in('profile_id', teacherProfileIds)
      .eq('school_year', getCurrentSchoolYear());
    if (prefsError) {
      // A swallowed failure would silently drop teachers' prep constraints
      console.error('Error fetching teacher availability prefs:', prefsError);
      throw prefsError;
    }
    for (const pref of prefs ?? []) {
      // Prep windows are hard constraints when times exist; before/after
      // school preferences stay soft until bell-schedule/school-hours
      // derivation lands, so they don't over-restrict.
      const windows =
        pref.meeting_time_preference === 'prep' &&
        pref.prep_start &&
        pref.prep_end
          ? [
              {
                start_minutes: timeToMinutes(pref.prep_start),
                end_minutes: timeToMinutes(pref.prep_end),
              },
            ]
          : null;
      teacherConstraints.set(pref.profile_id, {
        key: pref.profile_id,
        busy: [],
        availableWindows: windows,
      });
    }
  }

  const leaRepRow = (adminsRes.data ?? [])[0] ?? null;

  return {
    caseload,
    site,
    hasSiteRules: !!rules && site.windows.length > 0,
    organizerBusy,
    teacherConstraints,
    existingMeetings,
    leaRep: leaRepRow
      ? { admin_id: leaRepRow.admin_id, full_name: leaRepRow.full_name }
      : null,
  };
}

export interface MeetingDraft {
  student: CaseloadStudent;
  slot: ProposedSlot;
}

function slotToTimestamps(slot: ProposedSlot): { start: string; end: string } {
  const [y, m, d] = slot.date.split('-').map(Number);
  const start = new Date(
    y,
    m - 1,
    d,
    Math.floor(slot.start_minutes / 60),
    slot.start_minutes % 60
  );
  const end = new Date(
    y,
    m - 1,
    d,
    Math.floor(slot.end_minutes / 60),
    slot.end_minutes % 60
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Persist reserved meetings + their attendee rows. Parents are added later
 * during the confirmation pass (SPE-209); admins honor holds (spec §13.2).
 */
export async function reserveMeetings(
  schoolId: string,
  drafts: MeetingDraft[],
  leaRep: { admin_id: string; full_name: string } | null
): Promise<{ reserved: number; attendeesFailed: boolean }> {
  const supabase = createClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const meetingRows = drafts.map(d => {
    const { start, end } = slotToTimestamps(d.slot);
    return {
      student_id: d.student.id,
      school_id: schoolId,
      organizer_id: user.id,
      meeting_type: d.student.meetingType,
      due_date: d.student.dueDate,
      scheduled_start: start,
      scheduled_end: end,
      status: 'reserved',
    };
  });

  const { data: inserted, error } = await supabase
    .from('iep_meetings')
    .insert(meetingRows)
    .select('id, student_id');

  if (error) {
    console.error('Error reserving meetings:', error);
    throw error;
  }

  // Every row must carry rsvp_status explicitly: PostgREST multi-row inserts
  // unify all rows' keys and send missing ones as NULL, which overrides the
  // column DEFAULT and violates NOT NULL — the whole batch fails (SPE-217).
  const attendeeRows = (inserted ?? []).flatMap(meeting => {
    const draft = drafts.find(d => d.student.id === meeting.student_id);
    const rows: Database['public']['Tables']['iep_meeting_attendees']['Insert'][] =
      [
        {
          meeting_id: meeting.id,
          profile_id: user.id,
          attendee_role: 'case_manager',
          rsvp_status: 'accepted',
          rsvp_source: 'speddy',
        },
      ];
    if (leaRep) {
      rows.push({
        meeting_id: meeting.id,
        profile_id: leaRep.admin_id,
        attendee_role: 'lea_rep',
        rsvp_status: 'pending',
      });
    }
    if (draft?.student.teacherProfileId) {
      rows.push({
        meeting_id: meeting.id,
        profile_id: draft.student.teacherProfileId,
        attendee_role: 'teacher',
        rsvp_status: 'pending',
      });
    } else if (draft?.student.teacherName) {
      rows.push({
        meeting_id: meeting.id,
        display_name: draft.student.teacherName,
        attendee_role: 'teacher',
        rsvp_status: 'pending',
      });
    }
    return rows;
  });

  let attendeesFailed = false;
  if (attendeeRows.length > 0) {
    const { error: attendeeError } = await supabase
      .from('iep_meeting_attendees')
      .insert(attendeeRows);
    if (attendeeError) {
      // Meetings exist; surface the partial failure so the caller can warn
      console.error('Error adding attendees:', attendeeError);
      attendeesFailed = true;
    }
  }

  return { reserved: inserted?.length ?? 0, attendeesFailed };
}

export async function cancelMeeting(meetingId: string): Promise<void> {
  const supabase = createClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // RLS scopes updates to the school; restrict cancellation to the
  // organizer at the query level as well.
  const { error } = await supabase
    .from('iep_meetings')
    .update({ status: 'cancelled' })
    .eq('id', meetingId)
    .eq('organizer_id', user.id);
  if (error) {
    console.error('Error cancelling meeting:', error);
    throw error;
  }
}
