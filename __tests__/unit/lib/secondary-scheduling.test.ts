/**
 * Pins the SPE-490/491 secondary-scheduling policy helpers:
 * - which provider roles keep scheduling at a secondary school (and that
 *   resource deliberately does not),
 * - the school-wide grade range a secondary bell schedule covers,
 * - the class-period-vs-break classification every conflict surface keys on.
 */

import {
  canScheduleAtSecondary,
  getSecondaryGradeRange,
  SECONDARY_SCHEDULING_ROLES,
} from '@/lib/school-helpers';
import {
  isClassPeriodBlock,
  SECONDARY_BELL_SCHEDULE_ACTIVITIES,
  BELL_SCHEDULE_ACTIVITIES,
} from '@/lib/constants/activity-types';

describe('canScheduleAtSecondary', () => {
  it('admits exactly the four related-service roles', () => {
    expect(SECONDARY_SCHEDULING_ROLES).toEqual([
      'speech',
      'ot',
      'counseling',
      'psychologist',
    ]);
    for (const role of SECONDARY_SCHEDULING_ROLES) {
      expect(canScheduleAtSecondary(role)).toBe(true);
    }
  });

  it('refuses resource — secondary resource plans a weekly bucket, not sessions', () => {
    expect(canScheduleAtSecondary('resource')).toBe(false);
  });

  it('refuses non-scheduling and absent roles', () => {
    expect(canScheduleAtSecondary('sea')).toBe(false);
    expect(canScheduleAtSecondary('teacher')).toBe(false);
    expect(canScheduleAtSecondary('specialist')).toBe(false);
    expect(canScheduleAtSecondary('intervention')).toBe(false);
    expect(canScheduleAtSecondary('site_admin')).toBe(false);
    expect(canScheduleAtSecondary('')).toBe(false);
    expect(canScheduleAtSecondary(null)).toBe(false);
    expect(canScheduleAtSecondary(undefined)).toBe(false);
  });

  it('tolerates surrounding whitespace like shouldUseWeeklyBucket does', () => {
    expect(canScheduleAtSecondary(' speech ')).toBe(true);
  });
});

describe('getSecondaryGradeRange', () => {
  it('derives the range from the school grade span', () => {
    expect(
      getSecondaryGradeRange({ grade_span_low: '9', grade_span_high: '12' })
    ).toEqual(['9', '10', '11', '12']);
    expect(
      getSecondaryGradeRange({ grade_span_low: '6', grade_span_high: '8' })
    ).toEqual(['6', '7', '8']);
  });

  it('falls back to the full 6-12 when the span is unset', () => {
    expect(getSecondaryGradeRange(null)).toEqual([
      '6', '7', '8', '9', '10', '11', '12',
    ]);
    expect(getSecondaryGradeRange({})).toEqual([
      '6', '7', '8', '9', '10', '11', '12',
    ]);
  });

  it('clamps dirty spans into 6-12 rather than trusting them', () => {
    // A secondary school claiming a K low is dirty data (K-8/K-12 classify
    // as elementary before this helper is ever reached).
    expect(
      getSecondaryGradeRange({ grade_span_low: 'K', grade_span_high: '8' })
    ).toEqual(['6', '7', '8']);
    // An inverted span falls back to the full range.
    expect(
      getSecondaryGradeRange({ grade_span_low: '11', grade_span_high: '9' })
    ).toEqual(['6', '7', '8', '9', '10', '11', '12']);
  });

  it('handles a partial span (only one bound set)', () => {
    expect(
      getSecondaryGradeRange({ grade_span_low: '7', grade_span_high: null })
    ).toEqual(['7', '8', '9', '10', '11', '12']);
    expect(
      getSecondaryGradeRange({ grade_span_low: null, grade_span_high: '8' })
    ).toEqual(['6', '7', '8']);
  });
});

describe('isClassPeriodBlock', () => {
  it('classifies every "Period …" preset as a class period', () => {
    const periodPresets = SECONDARY_BELL_SCHEDULE_ACTIVITIES.filter(a =>
      a.startsWith('Period')
    );
    expect(periodPresets.length).toBeGreaterThan(0);
    for (const preset of periodPresets) {
      expect(isClassPeriodBlock(preset)).toBe(true);
    }
  });

  it('keeps full conflict behavior for breaks and elementary blocks', () => {
    for (const name of ['Advisory', 'Brunch', 'Lunch', 'Passing']) {
      expect(isClassPeriodBlock(name)).toBe(false);
    }
    for (const name of BELL_SCHEDULE_ACTIVITIES) {
      expect(isClassPeriodBlock(name)).toBe(false);
    }
  });

  it('is exact-label only — descriptive names keep conflict behavior', () => {
    expect(isClassPeriodBlock('Reading Period')).toBe(false);
    expect(isClassPeriodBlock('Period 1 Math')).toBe(false);
    expect(isClassPeriodBlock('period 3')).toBe(true); // case-insensitive
    expect(isClassPeriodBlock(' Period A ')).toBe(true); // whitespace-tolerant
    expect(isClassPeriodBlock('')).toBe(false);
    expect(isClassPeriodBlock(null)).toBe(false);
    expect(isClassPeriodBlock(undefined)).toBe(false);
  });
});
