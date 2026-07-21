import { createMockSupabaseClient } from '@/test-utils/supabase-test-helpers';
import type { OtherProviderSessionLite } from '@/lib/services/session-update-service';

// The scheduler constructs a Supabase client and the singleton data manager on
// construction; mock the client module so both resolve to a harmless stub. This test
// exercises the pure hard-avoid decision (hasCrossProviderConflict), not any I/O.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => createMockSupabaseClient(),
}));

import { OptimizedScheduler } from '@/lib/scheduling/optimized-scheduler';

// A cross-provider Speech session for a shared child: Monday 09:00–09:30.
const other = (over: Partial<OtherProviderSessionLite> = {}): OtherProviderSessionLite => ({
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '09:30:00',
  provider_role: 'speech',
  ...over,
});

/**
 * SPE-287: the auto-scheduler must hard-avoid a slot that would double-book a shared
 * student with another provider. hasCrossProviderConflict is the private decision the
 * slot search consults; inject a minimal context and assert it directly.
 */
function withContext(
  crossProviderSessionsByStudent: Map<string, OtherProviderSessionLite[]>,
): { conflicts: (studentId: string, day: number, start: string, end: string) => boolean } {
  const scheduler = new OptimizedScheduler('provider-1', 'resource') as any;
  scheduler.context = { crossProviderSessionsByStudent };
  return {
    conflicts: (studentId, day, start, end) =>
      scheduler.hasCrossProviderConflict(studentId, day, start, end),
  };
}

describe('OptimizedScheduler.hasCrossProviderConflict (SPE-287)', () => {
  const SHARED = 'shared-student';
  const base = () => new Map<string, OtherProviderSessionLite[]>([[SHARED, [other()]]]);

  it('hard-avoids a slot overlapping the shared student\'s other-provider session', () => {
    // Scheduler passes startTime as "HH:MM" and endTime as "HH:MM:00" (addMinutesToTime).
    expect(withContext(base()).conflicts(SHARED, 1, '09:15', '09:45:00')).toBe(true);
  });

  it('allows an adjacent slot (half-open intervals — touching is not overlapping)', () => {
    // Starts exactly when the other session ends.
    expect(withContext(base()).conflicts(SHARED, 1, '09:30', '10:00:00')).toBe(false);
    // Ends exactly when the other session starts.
    expect(withContext(base()).conflicts(SHARED, 1, '08:30', '09:00:00')).toBe(false);
  });

  it('does not block a different day', () => {
    expect(withContext(base()).conflicts(SHARED, 2, '09:15', '09:45:00')).toBe(false);
  });

  it('does not block a non-overlapping time on the same day', () => {
    expect(withContext(base()).conflicts(SHARED, 1, '11:00', '11:30:00')).toBe(false);
  });

  it('never conflicts for a student with no cross-provider match (not in the map)', () => {
    expect(withContext(base()).conflicts('solo-student', 1, '09:15', '09:45:00')).toBe(false);
  });

  it('never conflicts when the student has an empty cross-provider list', () => {
    const map = new Map<string, OtherProviderSessionLite[]>([[SHARED, []]]);
    expect(withContext(map).conflicts(SHARED, 1, '09:15', '09:45:00')).toBe(false);
  });

  it('detects an overlap among several cross-provider sessions for the same student', () => {
    const map = new Map<string, OtherProviderSessionLite[]>([[
      SHARED,
      [
        other({ start_time: '11:00:00', end_time: '11:30:00', provider_role: 'ot' }),
        other(), // the Monday 09:00–09:30 speech session
      ],
    ]]);
    expect(withContext(map).conflicts(SHARED, 1, '09:10', '09:20:00')).toBe(true);
  });
});

/**
 * SPE-287: guard the WIRING, not just the decision. A unit test of hasCrossProviderConflict
 * alone would still pass if someone deleted its call site in the slot search — so exercise
 * findSlotsWithCapacityLimit (the single choke point both scheduling passes flow through)
 * with a minimal context and assert an otherwise-valid slot is dropped iff a shared
 * student's cross-provider session overlaps it.
 */
describe('OptimizedScheduler slot search consults the hard-avoid (SPE-287)', () => {
  const SHARED = 'shared-student';
  // One free Monday 09:00 slot, wide-open school hours, no bells/activities/own-sessions.
  const schedulerWith = (crossMap: Map<string, OtherProviderSessionLite[]>) => {
    const scheduler = new OptimizedScheduler('provider-1', 'resource') as any;
    scheduler.context = {
      schoolSite: 'Willow',
      workDays: [1],
      bellSchedules: [],
      specialActivities: [],
      existingSessions: [],
      validSlots: new Map([
        ['1-09:00', { dayOfWeek: 1, startTime: '09:00', endTime: '', available: true, capacity: 8, conflicts: [] }],
      ]),
      schoolHours: [],
      studentGradeMap: new Map(),
      crossProviderSessionsByStudent: crossMap,
      providerAvailability: new Map(),
      bellSchedulesByGrade: new Map(),
      specialActivitiesByTeacher: new Map(),
      cacheMetadata: { lastFetched: new Date(), isStale: false, fetchErrors: [], queryCount: 0 },
    };
    return scheduler;
  };
  const student = { id: SHARED, grade_level: '3', teacher_name: 'Teacher A', initials: 'AB' };

  it('places the slot when the shared student has no overlapping cross-provider session', () => {
    const slots = schedulerWith(new Map()).findSlotsWithCapacityLimit(student, 30, 1, [1], 8, []);
    expect(slots).toHaveLength(1);
    expect(slots[0].startTime).toBe('09:00');
  });

  it('drops the only slot when a cross-provider session overlaps it (hard-avoid engaged)', () => {
    const blocked = new Map<string, OtherProviderSessionLite[]>([[
      SHARED,
      [{ day_of_week: 1, start_time: '09:00:00', end_time: '09:30:00', provider_role: 'speech' }],
    ]]);
    const slots = schedulerWith(blocked).findSlotsWithCapacityLimit(student, 30, 1, [1], 8, []);
    expect(slots).toHaveLength(0);
  });
});
