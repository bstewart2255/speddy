import {
  findOverlappingOtherProviderSession,
  OtherProviderSessionLite,
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
