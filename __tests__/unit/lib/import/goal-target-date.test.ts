/**
 * Unit tests for the IEP goal target-date parser (SPE-267). All goal text is
 * fictional. The parser must be conservative: only a confidently-parsed date
 * counts as "past"; anything ambiguous returns null so the goal stays selected.
 */

import { parseGoalTargetDate, isGoalTargetDatePast } from '@/lib/import/goal-target-date';

const iso = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

describe('parseGoalTargetDate', () => {
  it('parses numeric M/D/YYYY at the start of a goal', () => {
    expect(iso(parseGoalTargetDate('By 5/1/2027, Ana will read 90 wpm with 95% accuracy in 3 of 4 trials.')))
      .toBe('2027-05-01');
    expect(iso(parseGoalTargetDate('4/30/2026 target'))).toBe('2026-04-30');
  });

  it('does not parse an ambiguous 2- or 3-digit year (stays conservative → null)', () => {
    // Only a confident 4-digit year counts; a short/typo'd year must not resolve
    // to some ancient date and wrongly expire a current goal.
    expect(parseGoalTargetDate('by 4/30/26')).toBeNull();
    expect(parseGoalTargetDate('by 5/1/202')).toBeNull();
  });

  it('parses "Month YYYY" to the LAST day of that month', () => {
    expect(iso(parseGoalTargetDate('By April 2026, the student will ...'))).toBe('2026-04-30');
    expect(iso(parseGoalTargetDate('By May 2026 ...'))).toBe('2026-05-31');
    expect(iso(parseGoalTargetDate('By February 2028 ...'))).toBe('2028-02-29'); // leap year
  });

  it('parses month abbreviations and "Month D, YYYY"', () => {
    expect(iso(parseGoalTargetDate('By Apr 5, 2026 ...'))).toBe('2026-04-05');
    expect(iso(parseGoalTargetDate('Sept 2026'))).toBe('2026-09-30');
    expect(iso(parseGoalTargetDate('by Dec 2025'))).toBe('2025-12-31');
  });

  it('parses numeric M/YYYY (no day) to end of month', () => {
    expect(iso(parseGoalTargetDate('by 5/2027, ...'))).toBe('2027-05-31');
  });

  it('returns null when no date is confidently parseable', () => {
    expect(parseGoalTargetDate('By the end of the 2026-2027 school year, ...')).toBeNull();
    expect(parseGoalTargetDate('Ana will read fluently across settings.')).toBeNull();
    // Non-date numbers must not be mistaken for a date.
    expect(parseGoalTargetDate('read 90 words per minute with 95% accuracy in 3 of 4 trials')).toBeNull();
  });

  it('returns null for impossible dates rather than a wrong date', () => {
    expect(parseGoalTargetDate('13/45/2026')).toBeNull();
    expect(parseGoalTargetDate('2/30/2026')).toBeNull();
  });

  it('does not misread the D/YYYY tail of an invalid M/D/YYYY as a month/year', () => {
    // Regression: month 13 is invalid, so M/D/YYYY fails; the "1/2026" tail must
    // NOT then parse as Jan 2026 and wrongly expire the goal.
    expect(parseGoalTargetDate('by 13/1/2026, the student will ...')).toBeNull();
    expect(parseGoalTargetDate('99/2/2027')).toBeNull();
  });

  it('handles null/undefined/empty without throwing', () => {
    expect(parseGoalTargetDate(null)).toBeNull();
    expect(parseGoalTargetDate(undefined)).toBeNull();
    expect(parseGoalTargetDate('')).toBeNull();
  });
});

describe('isGoalTargetDatePast', () => {
  const now = new Date(2026, 6, 17); // 2026-07-17 (local)

  it('is true for a target date strictly before today', () => {
    expect(isGoalTargetDatePast('By April 2026, ...', now)).toBe(true);
    expect(isGoalTargetDatePast('By June 2026, ...', now)).toBe(true);
    expect(isGoalTargetDatePast('by 7/16/2026', now)).toBe(true);
  });

  it('is false for a future target date', () => {
    expect(isGoalTargetDatePast('By 5/1/2027, ...', now)).toBe(false);
  });

  it('does not treat the current month as past (month resolves to end of month)', () => {
    // July 2026 → 2026-07-31, which is not before 2026-07-17.
    expect(isGoalTargetDatePast('By July 2026, ...', now)).toBe(false);
  });

  it('is false on the target day itself (strictly-before comparison)', () => {
    expect(isGoalTargetDatePast('by 7/17/2026', now)).toBe(false);
  });

  it('is false when the date is unparseable (goal stays selected)', () => {
    expect(isGoalTargetDatePast('By the end of the 2026-2027 school year, ...', now)).toBe(false);
    expect(isGoalTargetDatePast('Ana will read fluently.', now)).toBe(false);
  });
});
