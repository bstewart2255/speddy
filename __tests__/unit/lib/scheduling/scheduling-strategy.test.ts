import {
  DEFAULT_SCHEDULING_STRATEGY,
  SCHEDULING_STRATEGY_OPTIONS,
  getGroupingKey,
  isGroupingStrategy,
  isSchedulingStrategy,
} from '@/lib/scheduling/scheduling-strategy';

/**
 * SPE-473: grouping keys decide which students the auto-scheduler will try to
 * stack into a shared slot. Getting one wrong doesn't produce an invalid
 * schedule — every placement is still validated — but it does produce a
 * nonsense group, so the "never guess" cases below are the ones that matter.
 */
describe('scheduling strategy grouping keys (SPE-473)', () => {
  describe('grade-grouped', () => {
    it('groups students who share a grade', () => {
      const a = getGroupingKey({ grade_level: '3' }, 'grade-grouped');
      const b = getGroupingKey({ grade_level: '3' }, 'grade-grouped');
      expect(a).not.toBeNull();
      expect(a).toBe(b);
    });

    it('ignores surrounding whitespace, which arrives from CSV uploads', () => {
      expect(getGroupingKey({ grade_level: ' 3 ' }, 'grade-grouped')).toBe(
        getGroupingKey({ grade_level: '3' }, 'grade-grouped')
      );
    });

    it('keeps different grades apart', () => {
      expect(getGroupingKey({ grade_level: '3' }, 'grade-grouped')).not.toBe(
        getGroupingKey({ grade_level: '4' }, 'grade-grouped')
      );
    });

    it('returns null for a student with no grade rather than a joinable key', () => {
      // Two students who both lack a grade are not in the same grade. A shared
      // non-null key here would silently group every ungraded student together.
      expect(getGroupingKey({ grade_level: null }, 'grade-grouped')).toBeNull();
      expect(getGroupingKey({ grade_level: '   ' }, 'grade-grouped')).toBeNull();
      expect(getGroupingKey({}, 'grade-grouped')).toBeNull();
    });
  });

  describe('teacher-grouped', () => {
    it('groups students who share a teacher id', () => {
      const key = getGroupingKey({ teacher_id: 't-1' }, 'teacher-grouped');
      expect(key).toBe(getGroupingKey({ teacher_id: 't-1' }, 'teacher-grouped'));
      expect(key).not.toBeNull();
    });

    it('prefers teacher_id over teacher_name when both are present', () => {
      // Same id, different spellings of the name: still one group.
      expect(
        getGroupingKey({ teacher_id: 't-1', teacher_name: 'Chen' }, 'teacher-grouped')
      ).toBe(
        getGroupingKey({ teacher_id: 't-1', teacher_name: 'Mrs. Chen' }, 'teacher-grouped')
      );
    });

    it('does not group an id-keyed student with a name-keyed one', () => {
      // Under-grouping (two spellings look like two teachers) is the safe
      // failure; pulling a student from the wrong classroom is not.
      expect(
        getGroupingKey({ teacher_id: 't-1', teacher_name: 'Chen' }, 'teacher-grouped')
      ).not.toBe(getGroupingKey({ teacher_name: 'Chen' }, 'teacher-grouped'));
    });

    it('falls back to a normalized name when there is no teacher id', () => {
      expect(getGroupingKey({ teacher_name: ' Chen ' }, 'teacher-grouped')).toBe(
        getGroupingKey({ teacher_name: 'chen' }, 'teacher-grouped')
      );
    });

    it('returns null when the student has neither id nor name', () => {
      expect(getGroupingKey({ teacher_id: null, teacher_name: null }, 'teacher-grouped')).toBeNull();
      expect(getGroupingKey({ teacher_name: '  ' }, 'teacher-grouped')).toBeNull();
    });
  });

  describe('non-grouping strategies', () => {
    it('produce no grouping key', () => {
      const student = { grade_level: '3', teacher_id: 't-1', teacher_name: 'Chen' };
      expect(getGroupingKey(student, 'balanced')).toBeNull();
      expect(getGroupingKey(student, 'morning-first')).toBeNull();
    });

    it('are not reported as grouping strategies', () => {
      expect(isGroupingStrategy('balanced')).toBe(false);
      expect(isGroupingStrategy('morning-first')).toBe(false);
      expect(isGroupingStrategy('grade-grouped')).toBe(true);
      expect(isGroupingStrategy('teacher-grouped')).toBe(true);
    });
  });
});

describe('scheduling strategy options (SPE-473)', () => {
  it('defaults to balanced, so an unchanged run behaves as it did before', () => {
    expect(DEFAULT_SCHEDULING_STRATEGY).toBe('balanced');
  });

  it('offers every strategy in the picker, each with copy for the provider', () => {
    expect(SCHEDULING_STRATEGY_OPTIONS.map(o => o.value)).toEqual([
      'balanced',
      'grade-grouped',
      'teacher-grouped',
      'morning-first',
    ]);
    for (const option of SCHEDULING_STRATEGY_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  it('recognises only real strategy values', () => {
    expect(isSchedulingStrategy('grade-grouped')).toBe(true);
    // Guards against a stale persisted value being trusted.
    expect(isSchedulingStrategy('two-pass')).toBe(false);
    expect(isSchedulingStrategy(undefined)).toBe(false);
  });
});
