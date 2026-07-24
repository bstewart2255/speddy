import { format } from 'date-fns';
import { formatRoleLabel } from '@/lib/utils/role-utils';

/**
 * SPE-320: pure renderer for the daily schedule email.
 *
 * Returns `{ subject, html, text }` from already-assembled session data so it is
 * unit-testable with no DB or network. The HTML mirrors the approved test send
 * (Resend id e24980d2-29fa-4d3a-a5ae-da235866850c) minus its test-only warning
 * box. Student INITIALS ONLY — email is not a secure channel, so no full names,
 * goals, or IEP content ever appear here.
 */

export interface DailyScheduleSessionInput {
  /** Start time, 24h "HH:MM" or "HH:MM:SS". */
  startTime: string | null;
  /** End time, 24h "HH:MM" or "HH:MM:SS". */
  endTime: string | null;
  /** Student initials for this session (e.g. "J.M."). */
  studentInitials: string;
  /** Stable id used to de-duplicate students within a time slot. */
  studentId: string | null;
  /** Service type code (e.g. "resource", "speech") — rendered via formatRoleLabel. */
  serviceType: string;
  /** Non-null when this session belongs to a group (drives the Group badge). */
  groupId: string | null;
  /** School site for this session's student; shown only when `showSchoolSite`. */
  schoolSite?: string | null;
}

export interface DailyScheduleEmailInput {
  /** The schedule date; drives the subject/header label ("Friday, July 24"). */
  date: Date;
  sessions: DailyScheduleSessionInput[];
  /** Add a per-row "Site" column (recipient works at multiple schools). */
  showSchoolSite?: boolean;
  /** Absolute URL to the in-app settings page for the footer link. */
  settingsUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** One rendered row: a time slot, possibly with several students (a group). */
interface ScheduleRow {
  startTime: string;
  endTime: string | null;
  initials: string[];
  serviceType: string;
  isGroup: boolean;
  schoolSite: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Minutes since midnight, for stable numeric sorting of "HH:MM[:SS]". */
function timeToMinutes(time: string | null): number {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const [h, m] = time.split(':');
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
}

/** { display: "8:30", ampm: "AM" } from "08:30:00". */
function to12Hour(time: string): { display: string; ampm: 'AM' | 'PM' } {
  const [hStr, mStr] = time.split(':');
  const hour = parseInt(hStr, 10) || 0;
  const minute = (mStr ?? '00').padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return { display: `${displayHour}:${minute}`, ampm };
}

/** "8:30 – 9:00 AM" (meridiem collapses when start and end share it). */
function formatTimeRange(startTime: string, endTime: string | null): string {
  const start = to12Hour(startTime);
  if (!endTime) return `${start.display} ${start.ampm}`;
  const end = to12Hour(endTime);
  const startLabel =
    start.ampm === end.ampm ? start.display : `${start.display} ${start.ampm}`;
  return `${startLabel} – ${end.display} ${end.ampm}`;
}

/**
 * Collapse per-student sessions into per-time-slot rows (keyed by start time,
 * matching the calendar/PDF convention), de-duplicating students within a slot
 * and preserving first-seen order. Rows are sorted by start time.
 */
function buildRows(sessions: DailyScheduleSessionInput[]): ScheduleRow[] {
  const slots = new Map<string, ScheduleRow>();
  const seenBySlot = new Map<string, Set<string>>();

  for (const s of sessions) {
    if (!s.startTime) continue;
    const key = s.startTime;
    let row = slots.get(key);
    if (!row) {
      row = {
        startTime: s.startTime,
        endTime: s.endTime,
        initials: [],
        serviceType: s.serviceType,
        isGroup: false,
        schoolSite: s.schoolSite ?? null,
      };
      slots.set(key, row);
      seenBySlot.set(key, new Set());
    }
    const seen = seenBySlot.get(key)!;
    const dedupeKey = s.studentId ?? `${s.studentInitials}:${row.initials.length}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      row.initials.push(s.studentInitials);
    }
    if (s.groupId) row.isGroup = true;
  }

  return Array.from(slots.values()).sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
}

const GROUP_BADGE_HTML =
  '<span style="display:inline-block;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;">Group</span>';

export function renderDailyScheduleEmail(
  input: DailyScheduleEmailInput
): RenderedEmail {
  const { date, sessions, showSchoolSite = false, settingsUrl } = input;
  const rows = buildRows(sessions);
  const dateLabel = format(date, 'EEEE, MMMM d'); // e.g. "Friday, July 24"
  const count = rows.length;
  const countLabel = `${count} ${count === 1 ? 'session' : 'sessions'} today`;

  const subject = `Your Speddy schedule for ${dateLabel}`;

  // ----- Plain text -----
  const textRows = rows.map((row) => {
    const time = formatTimeRange(row.startTime, row.endTime);
    const students = row.initials.join(', ') + (row.isGroup ? ' (Group)' : '');
    const service = formatRoleLabel(row.serviceType);
    const site = showSchoolSite && row.schoolSite ? `  [${row.schoolSite}]` : '';
    return `${time}   ${students}   ${service}${site}`;
  });
  const text = [
    'SPEDDY — DAILY SCHEDULE',
    '',
    `Good morning! Here's your schedule for ${dateLabel}.`,
    '',
    ...textRows,
    '',
    `${countLabel}.`,
    '',
    '—',
    "You're receiving this because daily schedule emails are turned on in your Speddy settings.",
    `Turn them off anytime in Settings → Email notifications: ${settingsUrl}`,
  ].join('\n');

  // ----- HTML -----
  const headerCells = [
    'Time',
    'Students',
    'Service',
    ...(showSchoolSite ? ['Site'] : []),
  ]
    .map(
      (h) =>
        `<td style="padding:8px 12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">${h}</td>`
    )
    .join('');

  const bodyRows = rows
    .map((row, i) => {
      const last = i === rows.length - 1;
      const border = last ? '' : 'border-bottom:1px solid #f3f4f6;';
      const time = escapeHtml(formatTimeRange(row.startTime, row.endTime));
      const initials = escapeHtml(row.initials.join(', '));
      const students = row.isGroup ? `${initials} ${GROUP_BADGE_HTML}` : initials;
      const service = escapeHtml(formatRoleLabel(row.serviceType));
      const siteCell = showSchoolSite
        ? `<td style="padding:12px;font-size:13px;color:#6b7280;${border}">${escapeHtml(row.schoolSite ?? '')}</td>`
        : '';
      return `              <tr>
                <td style="padding:12px;font-size:14px;color:#111827;white-space:nowrap;${border}">${time}</td>
                <td style="padding:12px;font-size:14px;color:#111827;${border}">${students}</td>
                <td style="padding:12px;font-size:13px;color:#6b7280;${border}">${service}</td>
                ${siteCell}
              </tr>`;
    })
    .join('\n');

  const settingsHref = escapeHtml(settingsUrl);

  const html = `<div style="background-color:#f3f4f6;padding:24px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#2563eb;padding:20px 28px;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.3px;">Speddy</span>
            <span style="color:#bfdbfe;font-size:13px;float:right;padding-top:6px;">Daily schedule</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px 28px;">
            <p style="margin:0 0 4px 0;font-size:18px;color:#111827;font-weight:600;">Good morning! 👋</p>
            <p style="margin:0 0 20px 0;font-size:14px;color:#6b7280;">Here's your schedule for <strong style="color:#111827;">${escapeHtml(dateLabel)}</strong> — ${escapeHtml(countLabel)}.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
${headerCells.replace(/^/, '                ')}
              </tr>
${bodyRows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">You're receiving this because daily schedule emails are turned on in your Speddy settings.<br/>Turn them off anytime in <a href="${settingsHref}" style="color:#6b7280;font-weight:600;text-decoration:underline;">Settings → Email notifications</a>.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</div>`;

  return { subject, html, text };
}
