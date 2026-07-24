/**
 * SPE-320 · daily schedule email renderer.
 *
 * The renderer is a pure function so we can pin its contract without a DB or
 * network: subject/html/text shape, INITIALS-ONLY bodies (email is not a secure
 * channel), the Group badge, per-time-slot collapsing, and time sorting.
 */
import {
  renderDailyScheduleEmail,
  type DailyScheduleSessionInput,
} from '@/lib/email/daily-schedule';

// Friday, July 24 2026, noon-local (timezone-independent calendar day).
const DATE = new Date(2026, 6, 24, 12, 0, 0);
const SETTINGS_URL = 'https://www.speddy.xyz/dashboard/settings';

const session = (
  over: Partial<DailyScheduleSessionInput> & { startTime: string }
): DailyScheduleSessionInput => ({
  endTime: null,
  studentInitials: 'X.X.',
  studentId: over.startTime,
  serviceType: 'resource',
  groupId: null,
  ...over,
});

describe('renderDailyScheduleEmail', () => {
  it('produces subject, html and text with the date label', () => {
    const out = renderDailyScheduleEmail({
      date: DATE,
      settingsUrl: SETTINGS_URL,
      sessions: [
        session({ startTime: '08:30:00', endTime: '09:00:00', studentInitials: 'J.M.', studentId: 'j' }),
      ],
    });

    expect(out.subject).toBe('Your Speddy schedule for Friday, July 24');
    expect(out.html).toContain('<table');
    expect(out.html).toContain('J.M.');
    expect(out.text).toContain('SPEDDY');
    expect(out.text).toContain('J.M.');
    expect(out.text).toContain('1 session today'); // singular
  });

  it('sorts rows by start time and collapses a group into one badged row', () => {
    const out = renderDailyScheduleEmail({
      date: DATE,
      settingsUrl: SETTINGS_URL,
      sessions: [
        // Deliberately out of order.
        session({ startTime: '13:15:00', endTime: '13:45:00', studentInitials: 'R.H.', studentId: 'r' }),
        session({ startTime: '08:30:00', endTime: '09:00:00', studentInitials: 'J.M.', studentId: 'j' }),
        session({ startTime: '09:00:00', endTime: '09:30:00', studentInitials: 'A.R.', studentId: 'a', groupId: 'g1' }),
        session({ startTime: '09:00:00', endTime: '09:30:00', studentInitials: 'K.T.', studentId: 'k', groupId: 'g1' }),
      ],
    });

    // Three rendered rows (the two 9:00 sessions collapse into one).
    expect(out.html).toContain('3 sessions today');

    // Time order preserved in both html and text.
    expect(out.html.indexOf('8:30')).toBeLessThan(out.html.indexOf('9:00'));
    expect(out.html.indexOf('9:00')).toBeLessThan(out.html.indexOf('1:15'));
    expect(out.text.indexOf('J.M.')).toBeLessThan(out.text.indexOf('A.R.'));
    expect(out.text.indexOf('A.R.')).toBeLessThan(out.text.indexOf('R.H.'));

    // Group members share one row.
    expect(out.html).toContain('A.R., K.T.');
    expect(out.text).toContain('A.R., K.T. (Group)');

    // The Group badge appears exactly once (only the grouped row).
    expect((out.html.match(/>Group</g) || []).length).toBe(1);
  });

  it('renders the meridiem-collapsed time range and service label', () => {
    const out = renderDailyScheduleEmail({
      date: DATE,
      settingsUrl: SETTINGS_URL,
      sessions: [
        session({ startTime: '08:30:00', endTime: '09:00:00', studentInitials: 'J.M.', serviceType: 'speech' }),
      ],
    });
    expect(out.html).toContain('8:30 – 9:00 AM');
    expect(out.html).toContain('Speech');
  });

  it('adds a Site column only when showSchoolSite is set', () => {
    const withSite = renderDailyScheduleEmail({
      date: DATE,
      settingsUrl: SETTINGS_URL,
      showSchoolSite: true,
      sessions: [
        session({ startTime: '08:30:00', studentInitials: 'J.M.', schoolSite: 'Lincoln Elementary' }),
      ],
    });
    expect(withSite.html).toContain('>Site<');
    expect(withSite.html).toContain('Lincoln Elementary');

    const withoutSite = renderDailyScheduleEmail({
      date: DATE,
      settingsUrl: SETTINGS_URL,
      sessions: [session({ startTime: '08:30:00', studentInitials: 'J.M.', schoolSite: 'Lincoln Elementary' })],
    });
    expect(withoutSite.html).not.toContain('>Site<');
  });

  it('links the footer to Settings and escapes dynamic values', () => {
    const out = renderDailyScheduleEmail({
      date: DATE,
      settingsUrl: SETTINGS_URL,
      showSchoolSite: true,
      sessions: [
        session({ startTime: '08:30:00', studentInitials: 'J.M.', schoolSite: 'Tom & Jerry <ES>' }),
      ],
    });
    expect(out.html).toContain(`href="${SETTINGS_URL}"`);
    expect(out.html).toContain('Settings → Email notifications');
    // No unescaped HTML from dynamic data.
    expect(out.html).toContain('Tom &amp; Jerry &lt;ES&gt;');
    expect(out.html).not.toContain('Tom & Jerry <ES>');
  });
});
