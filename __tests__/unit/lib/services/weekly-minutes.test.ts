/**
 * Pins the one shared IEP-minutes conversion system: every stated period →
 * minutes/week through the 180-day / 36-week / 9-school-month year, rounding
 * up; the secondary-resource weekly bucket; and the storage-bound guard that
 * keeps out-of-range splits from reaching the database.
 */

import {
  toWeeklyMinutes,
  calculateSessions,
  fitsScheduleConstraints,
  shouldUseWeeklyBucket,
  MAX_MINUTES_PER_SESSION,
  MAX_SESSIONS_PER_WEEK,
} from '@/lib/services/weekly-minutes';

describe('toWeeklyMinutes', () => {
  it('converts each recognized period through the 36-week year', () => {
    expect(toWeeklyMinutes(30, 'weekly')).toBe(30);
    expect(toWeeklyMinutes(30, 'daily')).toBe(150);
    expect(toWeeklyMinutes(120, 'monthly')).toBe(30);
    expect(toWeeklyMinutes(1080, 'yearly')).toBe(30);
  });

  it('rounds up so a conversion never suggests under-serving', () => {
    expect(toWeeklyMinutes(90, 'monthly')).toBe(23); // 22.5 → 23
    expect(toWeeklyMinutes(1500, 'yearly')).toBe(42); // 41.67 → 42
  });

  it('returns 0 for unrecognized periods so callers flag for review', () => {
    expect(toWeeklyMinutes(30, '')).toBe(0);
    expect(toWeeklyMinutes(30, 'quarterly')).toBe(0);
  });
});

describe('calculateSessions — weekly bucket (secondary resource)', () => {
  it('keeps the full weekly amount as a single bucket', () => {
    expect(calculateSessions(570, { weeklyBucket: true })).toEqual({
      sessionsPerWeek: 1,
      minutesPerSession: 570,
    });
    // Small amounts stay one bucket too — no 45-minute special case here.
    expect(calculateSessions(45, { weeklyBucket: true })).toEqual({
      sessionsPerWeek: 1,
      minutesPerSession: 45,
    });
  });

  it('still returns zero sessions for non-positive minutes', () => {
    expect(calculateSessions(0, { weeklyBucket: true })).toEqual({
      sessionsPerWeek: 0,
      minutesPerSession: 0,
    });
  });

  it('leaves the elementary chop untouched when the flag is off', () => {
    expect(calculateSessions(570)).toEqual({ sessionsPerWeek: 19, minutesPerSession: 30 });
    expect(calculateSessions(570, {})).toEqual({ sessionsPerWeek: 19, minutesPerSession: 30 });
  });
});

describe('fitsScheduleConstraints', () => {
  it('accepts splits inside the storage bounds', () => {
    expect(fitsScheduleConstraints({ sessionsPerWeek: 1, minutesPerSession: 570 })).toBe(true);
    expect(
      fitsScheduleConstraints({
        sessionsPerWeek: MAX_SESSIONS_PER_WEEK,
        minutesPerSession: 30,
      })
    ).toBe(true);
    expect(
      fitsScheduleConstraints({
        sessionsPerWeek: 1,
        minutesPerSession: MAX_MINUTES_PER_SESSION,
      })
    ).toBe(true);
  });

  it('rejects splits past either cap or non-positive', () => {
    expect(
      fitsScheduleConstraints({ sessionsPerWeek: MAX_SESSIONS_PER_WEEK + 1, minutesPerSession: 30 })
    ).toBe(false);
    expect(
      fitsScheduleConstraints({ sessionsPerWeek: 1, minutesPerSession: MAX_MINUTES_PER_SESSION + 1 })
    ).toBe(false);
    expect(fitsScheduleConstraints({ sessionsPerWeek: 0, minutesPerSession: 0 })).toBe(false);
  });
});

describe('shouldUseWeeklyBucket', () => {
  const middle = { school_type: 'Middle Schools (Public)', grade_span_low: '6' };
  const elementary = { school_type: 'Elementary Schools (Public)', grade_span_low: 'K' };

  it('is on only for resource providers at secondary schools', () => {
    expect(shouldUseWeeklyBucket('resource', middle)).toBe(true);
    expect(shouldUseWeeklyBucket('resource ', middle)).toBe(true); // role strings can carry spaces
    expect(shouldUseWeeklyBucket('resource', elementary)).toBe(false);
    expect(shouldUseWeeklyBucket('speech', middle)).toBe(false);
    expect(shouldUseWeeklyBucket('ot', middle)).toBe(false);
  });

  it('falls back to grade span when school_type is unset, and defaults off', () => {
    expect(shouldUseWeeklyBucket('resource', { school_type: null, grade_span_low: '7' })).toBe(true);
    expect(shouldUseWeeklyBucket('resource', { school_type: null, grade_span_low: 'K' })).toBe(false);
    expect(shouldUseWeeklyBucket('resource', null)).toBe(false);
    expect(shouldUseWeeklyBucket(null, middle)).toBe(false);
  });

  it('treats K-8 combined sites as elementary (existing product decision)', () => {
    expect(shouldUseWeeklyBucket('resource', { school_type: 'K-8', grade_span_low: 'K' })).toBe(false);
  });
});
