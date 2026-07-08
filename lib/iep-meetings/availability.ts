/**
 * IEP meeting availability engine (SPE-206).
 *
 * Pure functions — no I/O. A slot is valid when it fits inside a site
 * meeting window, avoids blackouts and the site's meeting-capacity rules,
 * and works for every attendee: outside their busy intervals and inside
 * their available windows (when they have declared any).
 *
 * Availability is the union of whatever constraint sources exist per
 * person (spec §5). Sources are assembled by the query layer; the Google
 * free/busy source plugs in as one more BusyInterval producer when
 * calendar integration lands (SPE-205).
 *
 * Times are minutes-from-midnight on a local calendar date ('YYYY-MM-DD')
 * to keep the math timezone-free; conversion to timestamps happens at
 * persistence time.
 */

export interface DayWindow {
  day_of_week: number; // 1 = Monday … 5 = Friday (matches site_meeting_rules)
  start_time: string; // 'HH:MM'
  end_time: string; // 'HH:MM'
}

export interface DateRange {
  start_date: string; // 'YYYY-MM-DD' inclusive
  end_date: string; // 'YYYY-MM-DD' inclusive
  label?: string;
}

export interface SiteConstraints {
  windows: DayWindow[];
  blackouts: DateRange[];
  maxMeetingsPerDay: number | null;
}

/** Busy interval on a specific date, in minutes from midnight. */
export interface BusyBlock {
  date?: string; // 'YYYY-MM-DD' — omit for weekly-recurring blocks
  day_of_week?: number; // 1-5 for weekly-recurring blocks (e.g. sessions)
  start_minutes: number;
  end_minutes: number;
  source: string; // 'session' | 'meeting' | 'google' | …
  label?: string;
}

export interface AttendeeConstraints {
  key: string; // profile id or stable identifier
  busy: BusyBlock[];
  /**
   * When present, slots must fall entirely inside one of these windows
   * (e.g. a teacher's prep block). Recurring weekly, all weekdays.
   */
  availableWindows?: { start_minutes: number; end_minutes: number }[] | null;
}

export interface ProposedSlot {
  date: string; // 'YYYY-MM-DD'
  start_minutes: number;
  end_minutes: number;
}

export interface FindSlotsParams {
  /** Inclusive search range, 'YYYY-MM-DD'. */
  from: string;
  to: string;
  durationMinutes: number;
  site: SiteConstraints;
  attendees: AttendeeConstraints[];
  /**
   * Already-scheduled meetings: consume site capacity and block overlap
   * (one IEP meeting at a time per site — the LEA rep can't be in two rooms).
   */
  existingMeetings: { date: string; start_minutes: number; end_minutes: number }[];
  /** Step between candidate start times. Default 15. */
  stepMinutes?: number;
  /** Stop after this many slots. Default 100. */
  limit?: number;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** ISO day of week for a 'YYYY-MM-DD' string: 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function inBlackout(date: string, blackouts: DateRange[]): DateRange | null {
  return (
    blackouts.find(b => b.start_date <= date && date <= b.end_date) ?? null
  );
}

/** Reason a specific slot doesn't work; empty array = slot is valid. */
export interface SlotConflict {
  kind:
    | 'blackout'
    | 'outside_windows'
    | 'site_capacity'
    | 'meeting_overlap'
    | 'attendee_busy'
    | 'attendee_unavailable';
  attendeeKey?: string;
  label?: string;
}

export function getSlotConflicts(
  slot: ProposedSlot,
  params: Pick<FindSlotsParams, 'site' | 'attendees' | 'existingMeetings'>
): SlotConflict[] {
  const conflicts: SlotConflict[] = [];
  const { site, attendees, existingMeetings } = params;
  const dow = isoDayOfWeek(slot.date);

  const blackout = inBlackout(slot.date, site.blackouts);
  if (blackout) {
    conflicts.push({ kind: 'blackout', label: blackout.label });
  }

  const fitsWindow = site.windows.some(
    w =>
      w.day_of_week === dow &&
      timeToMinutes(w.start_time) <= slot.start_minutes &&
      slot.end_minutes <= timeToMinutes(w.end_time)
  );
  if (!fitsWindow) conflicts.push({ kind: 'outside_windows' });

  const sameDay = existingMeetings.filter(m => m.date === slot.date);
  if (
    site.maxMeetingsPerDay !== null &&
    sameDay.length >= site.maxMeetingsPerDay
  ) {
    conflicts.push({ kind: 'site_capacity' });
  }
  if (
    sameDay.some(m =>
      overlaps(slot.start_minutes, slot.end_minutes, m.start_minutes, m.end_minutes)
    )
  ) {
    conflicts.push({ kind: 'meeting_overlap' });
  }

  for (const attendee of attendees) {
    const busyHit = attendee.busy.find(b => {
      const applies =
        b.date === slot.date || (!b.date && b.day_of_week === dow);
      return (
        applies &&
        overlaps(slot.start_minutes, slot.end_minutes, b.start_minutes, b.end_minutes)
      );
    });
    if (busyHit) {
      conflicts.push({
        kind: 'attendee_busy',
        attendeeKey: attendee.key,
        label: busyHit.label ?? busyHit.source,
      });
      continue;
    }
    if (attendee.availableWindows && attendee.availableWindows.length > 0) {
      const inside = attendee.availableWindows.some(
        w =>
          w.start_minutes <= slot.start_minutes &&
          slot.end_minutes <= w.end_minutes
      );
      if (!inside) {
        conflicts.push({ kind: 'attendee_unavailable', attendeeKey: attendee.key });
      }
    }
  }

  return conflicts;
}

/**
 * All valid slots in the range, chronological. Weekends are skipped
 * implicitly (site windows only cover Mon–Fri).
 */
export function findSlots(params: FindSlotsParams): ProposedSlot[] {
  const {
    from,
    to,
    durationMinutes,
    site,
    stepMinutes = 15,
    limit = 100,
  } = params;
  const slots: ProposedSlot[] = [];
  if (from > to || site.windows.length === 0) return slots;

  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (inBlackout(date, site.blackouts)) continue;
    const dow = isoDayOfWeek(date);
    const dayWindows = site.windows.filter(w => w.day_of_week === dow);
    for (const window of dayWindows) {
      const winStart = timeToMinutes(window.start_time);
      const winEnd = timeToMinutes(window.end_time);
      for (
        let start = winStart;
        start + durationMinutes <= winEnd;
        start += stepMinutes
      ) {
        const slot: ProposedSlot = {
          date,
          start_minutes: start,
          end_minutes: start + durationMinutes,
        };
        if (getSlotConflicts(slot, params).length === 0) {
          slots.push(slot);
          if (slots.length >= limit) return slots;
        }
      }
    }
  }
  return slots;
}

export interface PlanRequest {
  key: string; // e.g. student id
  dueDate: string | null; // 'YYYY-MM-DD' compliance deadline
  attendees: AttendeeConstraints[];
}

export interface PlanResult {
  key: string;
  slot: ProposedSlot | null;
  reason?: 'no_valid_slot' | 'no_due_date';
}

/** Target scheduling 2–6 weeks before the due date (clamped to range). */
export const DUE_DATE_LEAD_DAYS_MIN = 14;
export const DUE_DATE_LEAD_DAYS_MAX = 42;

/**
 * Draft one meeting per request, earliest-due first. Placed meetings are
 * added to the occupied set so later placements can't collide (the
 * planner is the site's own busy source while it runs). Idempotent by
 * construction: requests already scheduled are excluded by the caller.
 */
export function planMeetings(
  requests: PlanRequest[],
  base: Omit<FindSlotsParams, 'attendees'>
): PlanResult[] {
  const occupied = [...base.existingMeetings];
  const results: PlanResult[] = [];

  const ordered = [...requests].sort((a, b) =>
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
  );

  for (const request of ordered) {
    if (!request.dueDate) {
      results.push({ key: request.key, slot: null, reason: 'no_due_date' });
      continue;
    }
    // Ideal window: [due - 6wk, due - 2wk], clamped to the search range;
    // fall back to anything before the due date if the ideal window is dry.
    const idealFrom = maxDate(base.from, addDays(request.dueDate, -DUE_DATE_LEAD_DAYS_MAX));
    const idealTo = minDate(base.to, addDays(request.dueDate, -DUE_DATE_LEAD_DAYS_MIN));
    const fallbackTo = minDate(base.to, addDays(request.dueDate, -1));

    const attempt = (from: string, to: string): ProposedSlot | null => {
      if (from > to) return null;
      const [slot] = findSlots({
        ...base,
        from,
        to,
        attendees: request.attendees,
        existingMeetings: occupied,
        limit: 1,
      });
      return slot ?? null;
    };

    const slot =
      attempt(idealFrom, idealTo) ?? attempt(base.from, fallbackTo);

    if (slot) {
      occupied.push({
        date: slot.date,
        start_minutes: slot.start_minutes,
        end_minutes: slot.end_minutes,
      });
      results.push({ key: request.key, slot });
    } else {
      results.push({ key: request.key, slot: null, reason: 'no_valid_slot' });
    }
  }
  return results;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
