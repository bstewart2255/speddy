// Aliased with a `mock` prefix so the jest.mock factory (hoisted above imports by
// babel-plugin-jest-hoist) may reference it.
import { createMockSupabaseClient as mockCreateSupabaseClient } from '@/test-utils/supabase-test-helpers';
import {
  findOverlappingSpecialActivity,
  type SpecialActivityLite,
} from '@/lib/services/session-update-service';

// The scheduler constructs a Supabase client and the singleton data manager on
// construction; mock the client module so both resolve to a harmless stub.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateSupabaseClient(),
}));

import { OptimizedScheduler } from '@/lib/scheduling/optimized-scheduler';

// PE with Mrs. Nova, Monday 10:00–10:30.
const activity = (over: Partial<SpecialActivityLite> = {}): SpecialActivityLite => ({
  teacher_id: 'teacher-nova',
  teacher_name: 'Mrs. Nova',
  day_of_week: 1,
  start_time: '10:00:00',
  end_time: '10:30:00',
  ...over,
});

describe('findOverlappingSpecialActivity (SPE-484)', () => {
  it('matches by teacher directory id', () => {
    const found = findOverlappingSpecialActivity(
      [activity()],
      { teacherId: 'teacher-nova', teacherName: 'MRS NOVA (drifted)' },
      1, '10:15', '10:45'
    );
    expect(found).not.toBeNull();
  });

  it('falls back to exact name when the activity carries no id', () => {
    const legacy = activity({ teacher_id: null });
    expect(
      findOverlappingSpecialActivity([legacy], { teacherId: null, teacherName: 'Mrs. Nova' }, 1, '10:15', '10:45')
    ).not.toBeNull();
  });

  it('does NOT warn on a name coincidence when both sides carry disagreeing ids', () => {
    // Two different teachers who happen to share a display name (SPE-468's
    // string-fragility warning) — the id disagreement must win.
    expect(
      findOverlappingSpecialActivity(
        [activity({ teacher_id: 'teacher-other' })],
        { teacherId: 'teacher-nova', teacherName: 'Mrs. Nova' },
        1, '10:15', '10:45'
      )
    ).toBeNull();
  });

  it('honors day and half-open interval boundaries', () => {
    expect(
      findOverlappingSpecialActivity([activity()], { teacherId: 'teacher-nova', teacherName: null }, 2, '10:15', '10:45')
    ).toBeNull();
    expect(
      findOverlappingSpecialActivity([activity()], { teacherId: 'teacher-nova', teacherName: null }, 1, '10:30', '11:00')
    ).toBeNull();
    expect(
      findOverlappingSpecialActivity([activity()], { teacherId: 'teacher-nova', teacherName: null }, 1, '09:30', '10:00')
    ).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(
      findOverlappingSpecialActivity([], { teacherId: 'teacher-nova', teacherName: 'Mrs. Nova' }, 1, '10:15', '10:45')
    ).toBeNull();
  });
});

/**
 * SPE-318: the auto-scheduler must skip slots overlapping the student's
 * TEACHER's special activities — for years this data arrived as a hardcoded
 * empty array, so the check was dead code. Inject a context whose activity
 * index carries the dual keys initializeContext now builds (teacher_name AND
 * teacher_id) and drive the real slot search.
 */
function schedulerWith(
  activitiesByKey: Map<string, Map<number, unknown[]>>,
): any {
  const scheduler = new OptimizedScheduler('provider-1', 'resource') as any;
  scheduler.context = {
    schoolSite: 'Willow',
    workDays: [1],
    bellSchedules: [],
    specialActivities: [],
    existingSessions: [],
    validSlots: new Map([
      ['1-10:00', { dayOfWeek: 1, startTime: '10:00', endTime: '', available: true, capacity: 8, conflicts: [] }],
    ]),
    schoolHours: [],
    studentGradeMap: new Map(),
    crossProviderSessionsByStudent: new Map(),
    providerAvailability: new Map(),
    bellSchedulesByGrade: new Map(),
    specialActivitiesByTeacher: activitiesByKey,
    mainstreamingByStudent: new Map(),
    cacheMetadata: { lastFetched: new Date(), isStale: false, fetchErrors: [], queryCount: 0 },
  };
  return scheduler;
}

const dualKeyedIndex = () => {
  const byKey = new Map<string, Map<number, unknown[]>>();
  const a = activity();
  for (const key of [a.teacher_name, a.teacher_id!]) {
    byKey.set(key, new Map([[1, [a]]]));
  }
  return byKey;
};

describe('OptimizedScheduler slot search respects special activities (SPE-318)', () => {
  it('drops a slot overlapping the activity, found via teacher_id despite name drift', () => {
    const student = { id: 's1', grade_level: '3', teacher_id: 'teacher-nova', teacher_name: 'MRS  NOVA', initials: 'AB' };
    const slots = schedulerWith(dualKeyedIndex()).findSlotsWithCapacityLimit(student, 30, 1, [1], 8, []);
    expect(slots).toHaveLength(0);
  });

  it('drops the slot via teacher_name for legacy students with no teacher_id', () => {
    const student = { id: 's1', grade_level: '3', teacher_id: null, teacher_name: 'Mrs. Nova', initials: 'AB' };
    const slots = schedulerWith(dualKeyedIndex()).findSlotsWithCapacityLimit(student, 30, 1, [1], 8, []);
    expect(slots).toHaveLength(0);
  });

  it('places the slot when the student\'s teacher has no overlapping activity', () => {
    const student = { id: 's1', grade_level: '3', teacher_id: 'teacher-else', teacher_name: 'Mr. Else', initials: 'AB' };
    const slots = schedulerWith(dualKeyedIndex()).findSlotsWithCapacityLimit(student, 30, 1, [1], 8, []);
    expect(slots).toHaveLength(1);
    expect(slots[0].startTime).toBe('10:00');
  });

  it('does not block on a name coincidence when the student\'s teacher has a different id', () => {
    // The index files activities under teacher_name too, so a student whose
    // teacher SHARES the display name but carries a different directory id
    // finds the activity via the name key — the slot search must apply the
    // shared rule's id-disagreement veto rather than over-block.
    const student = { id: 's1', grade_level: '3', teacher_id: 'teacher-else', teacher_name: 'Mrs. Nova', initials: 'AB' };
    const slots = schedulerWith(dualKeyedIndex()).findSlotsWithCapacityLimit(student, 30, 1, [1], 8, []);
    expect(slots).toHaveLength(1);
    expect(slots[0].startTime).toBe('10:00');
  });
});
