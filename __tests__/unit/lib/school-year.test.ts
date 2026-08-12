/**
 * SPE-460: pin the school-year rollover rule.
 *
 * This rule now has TWO implementations that must agree:
 *   - getCurrentSchoolYear() in lib/school-year.ts
 *   - public.current_school_year() in the database, which is the DEFAULT for
 *     school_year on bell_schedules, special_activities,
 *     activity_type_availability and the four rotation_* tables
 *     (supabase/migrations/20260812_spe460_current_school_year_default.sql).
 *
 * If they drift, rows written via the DB default land in a different year than
 * the one every read path filters on, and become invisible the moment they are
 * saved — which is exactly the bug SPE-459 had to recover 819 rows from.
 *
 * So: if you change the rule here, change the SQL function to match.
 * The boundary is what matters — August 1, evaluated in UTC.
 */
import { getCurrentSchoolYear, getNextSchoolYear } from '@/lib/school-year';

describe('getCurrentSchoolYear', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const at = (iso: string) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(iso));
  };

  it('returns the prior-year label on July 31 (before the flip)', () => {
    at('2026-07-31T23:59:59Z');
    expect(getCurrentSchoolYear()).toBe('2025-2026');
  });

  it('flips on August 1', () => {
    at('2026-08-01T00:00:00Z');
    expect(getCurrentSchoolYear()).toBe('2026-2027');
  });

  it('holds through the autumn term', () => {
    at('2026-12-15T12:00:00Z');
    expect(getCurrentSchoolYear()).toBe('2026-2027');
  });

  it('still names the same year after the calendar year turns over', () => {
    at('2027-01-05T12:00:00Z');
    expect(getCurrentSchoolYear()).toBe('2026-2027');
  });

  it('evaluates the boundary in UTC, not local time', () => {
    // 2026-08-01T00:30Z is still July 31 in US Pacific. The rule is UTC, so
    // this must read as the new school year regardless of where it runs.
    at('2026-08-01T00:30:00Z');
    expect(getCurrentSchoolYear()).toBe('2026-2027');
  });
});

describe('getNextSchoolYear', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is always the year after the current one', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-12T00:00:00Z'));
    expect(getCurrentSchoolYear()).toBe('2026-2027');
    expect(getNextSchoolYear()).toBe('2027-2028');
  });
});
