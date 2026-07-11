'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { CalendarConnectionCard } from '@/app/components/calendar/calendar-connection-card';
import { useSchool } from '@/app/components/providers/school-context';
import {
  DEFAULT_MEETING_WINDOWS,
  minutesToTime,
  planMeetings,
  type AttendeeConstraints,
  type BusyBlock,
  type PlanResult,
} from '@/lib/iep-meetings/availability';
import { fetchGoogleBusyBlocks } from '@/lib/calendar/google-busy';
import {
  cancelMeeting,
  getMyMeetings,
  getPlanningData,
  reserveMeetings,
  type MeetingListItem,
  type MeetingDraft,
  type PlanningData,
} from '@/lib/supabase/queries/iep-meetings';

const STATUS_STYLES: Record<string, string> = {
  reserved: 'bg-slate-100 text-slate-700 border-slate-300',
  confirming: 'bg-amber-50 text-amber-700 border-amber-300',
  confirmed: 'bg-green-50 text-green-700 border-green-300',
  held: 'bg-gray-100 text-gray-500 border-gray-300',
  draft: 'bg-gray-100 text-gray-500 border-gray-300',
};

function formatSlotDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function defaultHorizon(): string {
  // End of the current school year: June 30, rolling to next year from
  // July onward so the default is never in the past.
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-06-30`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MeetingsPage() {
  const { currentSchool, loading: schoolLoading } = useSchool();
  const schoolId = currentSchool?.school_id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [planning, setPlanning] = useState<PlanningData | null>(null);

  const [plannerOpen, setPlannerOpen] = useState(false);
  const [horizon, setHorizon] = useState(defaultHorizon());
  const [results, setResults] = useState<PlanResult[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reserving, setReserving] = useState(false);
  const [reservedCount, setReservedCount] = useState<number | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [googleNote, setGoogleNote] = useState<string | null>(null);
  const [holdsCreated, setHoldsCreated] = useState<number>(0);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const [meetingList, planningData] = await Promise.all([
        getMyMeetings(schoolId),
        getPlanningData(schoolId),
      ]);
      setMeetings(meetingList);
      setPlanning(planningData);
    } catch (err) {
      console.error('Failed to load meetings:', err);
      setError('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const unscheduled = useMemo(
    () =>
      (planning?.caseload ?? []).filter(
        s => !s.hasUpcomingMeeting && s.dueDate && s.dueDate >= todayStr()
      ),
    [planning]
  );

  const missingDueDateCount = useMemo(
    () =>
      (planning?.caseload ?? []).filter(
        s =>
          !s.hasUpcomingMeeting && (!s.dueDate || s.dueDate < todayStr())
      ).length,
    [planning]
  );

  const dueSoonCount = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    // Local-date string, consistent with todayStr()/dueDate comparisons
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    return unscheduled.filter(s => s.dueDate! <= cutoffStr).length;
  }, [unscheduled]);

  const runPlanner = useCallback(async () => {
    if (!planning) return;
    setDrafting(true);
    setGoogleNote(null);
    try {
      // The horizon filters by DUE DATE (spec §2.1): "plan meetings due
      // through [date]" — students due later wait for the next planning pass.
      const inHorizon = unscheduled.filter(s => s.dueDate! <= horizon);

      // Google free/busy as one more busy source (spec §5): the organizer's
      // own calendar plus teacher calendars already visible to them through
      // Google's sharing. Absent/broken connection or a failed lookup
      // degrades to internal sources — never blocks planning.
      let googleBusy: Map<string, BusyBlock[]> | null = null;
      try {
        const emails = Array.from(
          new Set(
            inHorizon
              .map(s => s.teacherEmail)
              .filter((e): e is string => !!e)
          )
        );
        const google = await fetchGoogleBusyBlocks({
          from: todayStr(),
          to: horizon,
          emails,
        });
        if (google.connected) googleBusy = google.busyByCalendar;
      } catch (err) {
        console.error('Google availability lookup failed:', err);
        setGoogleNote(
          'Google Calendar availability was unavailable — these drafts use internal schedules only.'
        );
      }

      const requests = inHorizon.map(student => {
        const attendees: AttendeeConstraints[] = [
          {
            key: 'organizer',
            busy: [
              ...planning.organizerBusy,
              ...(googleBusy?.get('primary') ?? []),
            ],
          },
        ];
        const teacherPrefs = student.teacherProfileId
          ? planning.teacherConstraints.get(student.teacherProfileId)
          : undefined;
        const teacherGoogleBusy = student.teacherEmail
          ? (googleBusy?.get(student.teacherEmail) ?? [])
          : [];
        if (teacherPrefs || teacherGoogleBusy.length > 0) {
          attendees.push({
            key:
              student.teacherProfileId ?? `email:${student.teacherEmail}`,
            busy: [...(teacherPrefs?.busy ?? []), ...teacherGoogleBusy],
            availableWindows: teacherPrefs?.availableWindows ?? null,
          });
        }
        return { key: student.id, dueDate: student.dueDate, attendees };
      });
      // No admin-configured windows yet? Case managers aren't blocked —
      // fall back to general school-day hours and say so in the UI.
      const site = planning.hasSiteRules
        ? planning.site
        : { ...planning.site, windows: DEFAULT_MEETING_WINDOWS };
      const planned = planMeetings(requests, {
        from: todayStr(),
        to: horizon,
        durationMinutes: 60,
        site,
        existingMeetings: planning.existingMeetings,
      });
      setResults(planned);
      setSelected(new Set(planned.filter(r => r.slot).map(r => r.key)));
      setReservedCount(null);
    } finally {
      setDrafting(false);
    }
  }, [planning, unscheduled, horizon]);

  const handleReserve = async () => {
    if (!planning || !results || !schoolId) return;
    const drafts: MeetingDraft[] = results
      .filter(r => r.slot && selected.has(r.key))
      .map(r => ({
        student: planning.caseload.find(s => s.id === r.key)!,
        slot: r.slot!,
      }));
    if (drafts.length === 0) return;
    setReserving(true);
    setError(null);
    try {
      const { reserved, attendeesFailed, meetingIds } = await reserveMeetings(
        schoolId,
        drafts,
        planning.leaRep
      );
      setReservedCount(reserved);
      // Best-effort hold events on the organizer's Google Calendar
      // (spec §2.1) — reservations stand regardless of Google.
      setHoldsCreated(0);
      if (meetingIds.length > 0) {
        try {
          const res = await fetch('/api/calendar/google/meeting-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', meetingIds }),
          });
          const sync = res.ok ? await res.json().catch(() => null) : null;
          if (sync?.connected && sync.created > 0) {
            setHoldsCreated(sync.created);
          }
        } catch (syncErr) {
          console.error('Calendar hold sync failed:', syncErr);
        }
      }
      if (attendeesFailed) {
        setError(
          'Meetings were reserved, but some attendees could not be added — check each meeting and re-add missing team members.'
        );
      }
      setResults(null);
      setPlannerOpen(false);
      await load();
    } catch (err) {
      console.error('Failed to reserve meetings:', err);
      setError('Failed to reserve meetings');
    } finally {
      setReserving(false);
    }
  };

  const handleCancel = async (meeting: MeetingListItem) => {
    if (
      !window.confirm(
        `Cancel the ${meeting.meeting_type} meeting for ${meeting.students?.initials ?? 'this student'}?`
      )
    )
      return;
    try {
      await cancelMeeting(meeting.id);
      // Remove the Google Calendar hold if one exists — best-effort; the
      // cancellation stands either way.
      fetch('/api/calendar/google/meeting-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', meetingId: meeting.id }),
      }).catch(syncErr => console.error('Hold removal failed:', syncErr));
      await load();
    } catch {
      setError('Failed to cancel meeting');
    }
  };

  if (schoolLoading || (loading && !planning)) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (!schoolId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <p className="text-gray-600">Select a school to manage meetings.</p>
        </Card>
      </div>
    );
  }

  const upcoming = meetings.filter(
    m => m.scheduled_start && new Date(m.scheduled_start) >= new Date()
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
        <Button
          onClick={() => {
            setPlannerOpen(o => !o);
            setResults(null);
          }}
        >
          {plannerOpen ? 'Close planner' : 'Plan meetings'}
        </Button>
      </div>
      <p className="text-gray-500 mb-6">
        IEP meetings for your caseload at {currentSchool?.display_name ?? 'this school'}.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
          {error}
        </div>
      )}
      {reservedCount !== null && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 mb-6">
          Reserved {reservedCount} meeting{reservedCount === 1 ? '' : 's'}.
          {holdsCreated > 0
            ? ` ${holdsCreated === reservedCount ? 'Holds' : `${holdsCreated} hold${holdsCreated === 1 ? '' : 's'}`} added to your Google Calendar.`
            : ''}{' '}
          Family confirmations come later — these are internal holds.
        </div>
      )}

      <CalendarConnectionCard className="mb-8" />

      {/* Attention strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Card padding="sm">
          <div className="flex items-center gap-3 px-2">
            <span
              className={`text-2xl font-bold tabular-nums ${dueSoonCount > 0 ? 'text-red-600' : 'text-gray-400'}`}
            >
              {dueSoonCount}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Due soon, unscheduled
              </p>
              <p className="text-xs text-gray-500">
                IEP due within 60 days and no meeting on the books
              </p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3 px-2">
            <span className="text-2xl font-bold tabular-nums text-gray-700">
              {unscheduled.length}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Unscheduled with due dates
              </p>
              <p className="text-xs text-gray-500">
                Students the planner can place right now
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Planner */}
      {plannerOpen && (
        <Card className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Plan meetings
          </h2>
          {planning && !planning.hasSiteRules && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm mb-4">
              Your site admin hasn&apos;t set meeting windows yet, so drafts
              use general school-day hours (Mon–Fri, 8:00–4:00). Once site
              rules are configured, planning will respect them automatically.
            </div>
          )}
          {unscheduled.length === 0 ? (
            <p className="text-gray-600 text-sm">
              {missingDueDateCount > 0 ? (
                <>
                  Nothing to plan yet — {missingDueDateCount} of your{' '}
                  {planning?.caseload.length ?? 0} students{' '}
                  {missingDueDateCount === 1 ? 'has' : 'have'} no upcoming IEP
                  date on file. Add an Upcoming IEP or Triennial date in each
                  student&apos;s details (or run the SEIS import) and they&apos;ll
                  appear here ready to schedule.
                </>
              ) : (
                <>
                  Nothing to plan — every student with an upcoming IEP due
                  date already has a meeting scheduled.
                </>
              )}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4 mb-4">
                <div>
                  <label
                    htmlFor="horizon"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Plan meetings due through
                  </label>
                  <input
                    id="horizon"
                    type="date"
                    value={horizon}
                    onChange={e => setHorizon(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={runPlanner}
                  isLoading={drafting}
                >
                  Draft placements
                </Button>
              </div>
              {googleNote && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-600 text-sm mb-4">
                  {googleNote}
                </div>
              )}

              {results && (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                          <th className="py-2 pr-3"></th>
                          <th className="py-2 pr-4">Student</th>
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 pr-4">Due</th>
                          <th className="py-2 pr-4">Proposed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map(r => {
                          const student = planning!.caseload.find(
                            s => s.id === r.key
                          );
                          if (!student) return null;
                          return (
                            <tr key={r.key} className="border-b border-gray-100">
                              <td className="py-2 pr-3">
                                <input
                                  type="checkbox"
                                  disabled={!r.slot}
                                  checked={selected.has(r.key)}
                                  onChange={e =>
                                    setSelected(prev => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(r.key);
                                      else next.delete(r.key);
                                      return next;
                                    })
                                  }
                                  aria-label={`Include ${student.initials}`}
                                />
                              </td>
                              <td className="py-2 pr-4 font-medium text-gray-900">
                                {student.initials}
                                <span className="text-gray-400 font-normal">
                                  {' '}
                                  · Gr {student.grade_level}
                                  {student.teacherName
                                    ? ` · ${student.teacherName}`
                                    : ''}
                                </span>
                              </td>
                              <td className="py-2 pr-4 capitalize">
                                {student.meetingType}
                              </td>
                              <td className="py-2 pr-4 tabular-nums">
                                {student.dueDate}
                              </td>
                              <td className="py-2 pr-4">
                                {r.slot ? (
                                  <span className="tabular-nums">
                                    {formatSlotDate(r.slot.date)} ·{' '}
                                    {minutesToTime(r.slot.start_minutes)}–
                                    {minutesToTime(r.slot.end_minutes)}
                                  </span>
                                ) : (
                                  <span className="text-red-600">
                                    {r.reason === 'no_due_date'
                                      ? 'No due date on file'
                                      : 'No valid slot found'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Button
                      onClick={handleReserve}
                      isLoading={reserving}
                      disabled={selected.size === 0}
                    >
                      Reserve {selected.size} meeting
                      {selected.size === 1 ? '' : 's'}
                    </Button>
                    <span className="text-xs text-gray-500">
                      Creates internal holds — no invites go to families yet.
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </Card>
      )}

      {/* Upcoming meetings */}
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
        Upcoming
      </h2>
      <Card padding="none">
        {upcoming.length === 0 ? (
          <p className="text-gray-500 text-sm p-6">
            No upcoming meetings. Use “Plan meetings” to draft your caseload&apos;s
            IEP meetings from their due dates.
          </p>
        ) : (
          upcoming.map((meeting, i) => (
            <div
              key={meeting.id}
              className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}
            >
              <div className="w-44 tabular-nums text-sm">
                <span className="font-semibold text-gray-900">
                  {formatTimestamp(meeting.scheduled_start)}
                </span>
              </div>
              <div className="flex-1">
                <span className="font-medium text-gray-900">
                  {meeting.students?.initials ?? '—'}
                </span>
                <span className="text-gray-400 text-sm">
                  {' '}
                  · <span className="capitalize">{meeting.meeting_type}</span>
                  {meeting.students?.grade_level
                    ? ` · Gr ${meeting.students.grade_level}`
                    : ''}
                  {meeting.due_date ? ` · due ${meeting.due_date}` : ''}
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 border uppercase ${STATUS_STYLES[meeting.status] ?? STATUS_STYLES.draft}`}
              >
                {meeting.status}
              </span>
              <span className="text-xs text-gray-400 tabular-nums w-14 text-right">
                {
                  meeting.iep_meeting_attendees.filter(
                    a => a.rsvp_status === 'accepted'
                  ).length
                }
                /{meeting.iep_meeting_attendees.length} in
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCancel(meeting)}
              >
                Cancel
              </Button>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
