import {
  findOverlappingOtherProviderSession,
  flaggedSessionStillConflicts,
  interpretCrossProviderStaleCheck,
  staleCrossProviderFlagsToClear,
  OtherProviderSessionLite,
  SameProviderSessionLite,
} from '@/lib/services/session-update-service';

// Default: Monday 09:00–09:30 Speech session belonging to another provider.
const s = (over: Partial<OtherProviderSessionLite> = {}): OtherProviderSessionLite => ({
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '09:30:00',
  provider_role: 'speech',
  ...over,
});

describe('findOverlappingOtherProviderSession (SPE-255)', () => {
  it('flags an overlapping other-provider session on the same day', () => {
    const hit = findOverlappingOtherProviderSession([s()], 1, '09:15:00', '09:45:00');
    expect(hit?.provider_role).toBe('speech');
  });

  it('ignores a session on a different day', () => {
    expect(
      findOverlappingOtherProviderSession([s({ day_of_week: 2 })], 1, '09:00:00', '09:30:00'),
    ).toBeNull();
  });

  it('treats adjacent slots as non-overlapping (half-open)', () => {
    // target starts exactly when the existing session ends
    expect(findOverlappingOtherProviderSession([s()], 1, '09:30:00', '10:00:00')).toBeNull();
    // target ends exactly when the existing session starts
    expect(findOverlappingOtherProviderSession([s()], 1, '08:30:00', '09:00:00')).toBeNull();
  });

  it('returns null for no candidates or non-overlapping times', () => {
    expect(findOverlappingOtherProviderSession([], 1, '09:00:00', '09:30:00')).toBeNull();
    expect(findOverlappingOtherProviderSession([s()], 1, '10:00:00', '10:30:00')).toBeNull();
  });

  it('skips candidates with missing day or times', () => {
    const bad = [s({ start_time: null }), s({ end_time: null }), s({ day_of_week: null })];
    expect(findOverlappingOtherProviderSession(bad, 1, '09:00:00', '09:30:00')).toBeNull();
  });

  it('returns the overlapping candidate among several', () => {
    const list = [
      s({ start_time: '11:00:00', end_time: '11:30:00', provider_role: 'ot' }),
      s({ provider_role: 'speech' }),
    ];
    const hit = findOverlappingOtherProviderSession(list, 1, '09:10:00', '09:20:00');
    expect(hit?.provider_role).toBe('speech');
  });
});

describe('flaggedSessionStillConflicts (SPE-255)', () => {
  // Flagged session under cleanup: Monday 09:00–09:30, id 'A'.
  const flagged = (over: Partial<{ id: string; day_of_week: number | null; start_time: string | null; end_time: string | null }> = {}) => ({
    id: 'A',
    day_of_week: 1,
    start_time: '09:00:00',
    end_time: '09:30:00',
    ...over,
  });

  const sameProv = (over: Partial<SameProviderSessionLite> = {}): SameProviderSessionLite => ({
    id: 'B',
    start_time: '09:15:00',
    end_time: '09:45:00',
    ...over,
  });

  it('keeps a flag that still overlaps another same-provider session', () => {
    expect(flaggedSessionStillConflicts(flagged(), [sameProv()], [])).toBe(true);
  });

  it('keeps a cross-provider-only flag with NO same-provider overlap (sibling-move regression)', () => {
    // The core SPE-255 fix: A double-books another provider but has no same-provider
    // overlap, so same-provider cleanup alone would wrongly clear it.
    const otherProvider: OtherProviderSessionLite[] = [
      { day_of_week: 1, start_time: '09:10:00', end_time: '09:40:00', provider_role: 'speech' },
    ];
    expect(flaggedSessionStillConflicts(flagged(), [], otherProvider)).toBe(true);
  });

  it('clears a flag with neither same- nor cross-provider overlap', () => {
    const otherProvider: OtherProviderSessionLite[] = [
      { day_of_week: 1, start_time: '11:00:00', end_time: '11:30:00', provider_role: 'ot' },
    ];
    expect(flaggedSessionStillConflicts(flagged(), [sameProv({ start_time: '13:00:00', end_time: '13:30:00' })], otherProvider)).toBe(false);
  });

  it('does not treat the flagged session as overlapping itself', () => {
    // Same id present in the same-provider list (the row queries include the flag).
    expect(flaggedSessionStillConflicts(flagged(), [sameProv({ id: 'A' })], [])).toBe(false);
  });

  it('treats adjacent same-provider slots as non-overlapping (half-open)', () => {
    expect(flaggedSessionStillConflicts(flagged(), [sameProv({ start_time: '09:30:00', end_time: '10:00:00' })], [])).toBe(false);
  });

  it('ignores a cross-provider match on a different day', () => {
    const otherProvider: OtherProviderSessionLite[] = [
      { day_of_week: 2, start_time: '09:10:00', end_time: '09:40:00', provider_role: 'speech' },
    ];
    expect(flaggedSessionStillConflicts(flagged(), [], otherProvider)).toBe(false);
  });

  it('returns false for a flagged session missing day or times', () => {
    expect(flaggedSessionStillConflicts(flagged({ day_of_week: null }), [sameProv()], [])).toBe(false);
    expect(flaggedSessionStillConflicts(flagged({ start_time: null }), [sameProv()], [])).toBe(false);
  });
});

describe('interpretCrossProviderStaleCheck (SPE-255 fail-safe)', () => {
  it('returns the matches for a successful array result', () => {
    const rows: OtherProviderSessionLite[] = [
      { day_of_week: 1, start_time: '09:00:00', end_time: '09:30:00', provider_role: 'speech' },
    ];
    expect(interpretCrossProviderStaleCheck(rows, null)).toEqual({ sessions: rows, failed: false });
  });

  it('treats a successful EMPTY array as a genuine "no matches" (not a failure)', () => {
    expect(interpretCrossProviderStaleCheck([], null)).toEqual({ sessions: [], failed: false });
  });

  it('fails (keeps flags) on an RPC error', () => {
    expect(interpretCrossProviderStaleCheck(null, { message: 'boom' })).toEqual({ sessions: [], failed: true });
  });

  it('fails (keeps flags) when there is no error but data is not an array', () => {
    // The regression this guards: null/undefined/object must NOT be read as "no matches",
    // which would silently clear a real cross-provider double-book flag.
    expect(interpretCrossProviderStaleCheck(null, null)).toEqual({ sessions: [], failed: true });
    expect(interpretCrossProviderStaleCheck(undefined, null)).toEqual({ sessions: [], failed: true });
    expect(interpretCrossProviderStaleCheck({ unexpected: true }, null)).toEqual({ sessions: [], failed: true });
  });
});

describe('staleCrossProviderFlagsToClear (SPE-288 pull-on-view)', () => {
  // Flagged template session: student 'stu1', Monday 09:00–09:30.
  const flag = (over: Partial<{ id: string; student_id: string | null; day_of_week: number | null; start_time: string | null; end_time: string | null }> = {}) => ({
    id: 'A',
    student_id: 'stu1',
    day_of_week: 1,
    start_time: '09:00:00',
    end_time: '09:30:00',
    ...over,
  });
  const sameMap = (entries: Array<[string, SameProviderSessionLite[]]> = []) =>
    new Map<string, SameProviderSessionLite[]>(entries);
  const crossMap = (entries: Array<[string, OtherProviderSessionLite[]]> = []) =>
    new Map<string, OtherProviderSessionLite[]>(entries);

  it('clears a flag with neither same- nor cross-provider overlap', () => {
    // same-provider map contains only the flag itself (queries include it) -> self-excluded.
    const same = sameMap([['stu1|1', [{ id: 'A', start_time: '09:00:00', end_time: '09:30:00' }]]]);
    expect(staleCrossProviderFlagsToClear([flag()], same, crossMap(), false)).toEqual(['A']);
  });

  it('keeps a flag that still overlaps a same-provider session', () => {
    const same = sameMap([['stu1|1', [
      { id: 'A', start_time: '09:00:00', end_time: '09:30:00' },
      { id: 'B', start_time: '09:15:00', end_time: '09:45:00' },
    ]]]);
    expect(staleCrossProviderFlagsToClear([flag()], same, crossMap(), false)).toEqual([]);
  });

  it('keeps a flag that still double-books across providers (no same-provider overlap)', () => {
    const cross = crossMap([['stu1', [{ day_of_week: 1, start_time: '09:10:00', end_time: '09:40:00', provider_role: 'speech' }]]]);
    expect(staleCrossProviderFlagsToClear([flag()], sameMap(), cross, false)).toEqual([]);
  });

  it('fails safe: clears NOTHING when the cross-provider check is unverifiable', () => {
    // Even a flag that looks fully resolved must be kept when crossCheckFailed is true.
    expect(staleCrossProviderFlagsToClear([flag()], sameMap(), crossMap(), true)).toEqual([]);
  });

  it('clears only the stale flags in a mixed batch', () => {
    const flags = [
      flag({ id: 'A', student_id: 'stu1' }),                 // resolved -> clear
      flag({ id: 'C', student_id: 'stu2' }),                 // still cross-conflict -> keep
      flag({ id: 'D', student_id: 'stu3', day_of_week: 2 }), // still same-conflict -> keep
    ];
    const same = sameMap([
      ['stu1|1', [{ id: 'A', start_time: '09:00:00', end_time: '09:30:00' }]],
      ['stu3|2', [
        { id: 'D', start_time: '09:00:00', end_time: '09:30:00' },
        { id: 'E', start_time: '09:20:00', end_time: '09:50:00' },
      ]],
    ]);
    const cross = crossMap([
      ['stu2', [{ day_of_week: 1, start_time: '09:05:00', end_time: '09:35:00', provider_role: 'ot' }]],
    ]);
    expect(staleCrossProviderFlagsToClear(flags, same, cross, false)).toEqual(['A']);
  });

  it('skips malformed flags (missing student, day, or times) without clearing them', () => {
    const flags = [
      flag({ id: 'A', student_id: null }),
      flag({ id: 'B', day_of_week: null }),
      flag({ id: 'C', start_time: null }),
    ];
    expect(staleCrossProviderFlagsToClear(flags, sameMap(), crossMap(), false)).toEqual([]);
  });
});
