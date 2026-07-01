import {
  normalizeDeliveredBy,
  isSpecialistSourceRole,
  SPECIALIST_SOURCE_ROLES,
} from './role-utils';

describe('SPECIALIST_SOURCE_ROLES', () => {
  it('matches the roles documented in ARCHITECTURE.md §1', () => {
    expect([...SPECIALIST_SOURCE_ROLES].sort()).toEqual(
      ['counseling', 'intervention', 'ot', 'psychologist', 'resource', 'specialist', 'speech'].sort(),
    );
  });
});

describe('isSpecialistSourceRole', () => {
  it('recognizes every specialist source role', () => {
    for (const role of SPECIALIST_SOURCE_ROLES) {
      expect(isSpecialistSourceRole(role)).toBe(true);
    }
  });

  it('rejects non-specialist roles', () => {
    expect(isSpecialistSourceRole('sea')).toBe(false);
    expect(isSpecialistSourceRole('teacher')).toBe(false);
    expect(isSpecialistSourceRole('site_admin')).toBe(false);
    expect(isSpecialistSourceRole('')).toBe(false);
  });

  it('is case-sensitive (expects already-normalized input)', () => {
    // The guard does not lowercase; normalizeDeliveredBy handles casing upstream.
    expect(isSpecialistSourceRole('Speech')).toBe(false);
  });
});

describe('normalizeDeliveredBy', () => {
  it('maps sea → sea', () => {
    expect(normalizeDeliveredBy('sea')).toBe('sea');
  });

  it('maps every specialist source role → specialist', () => {
    for (const role of SPECIALIST_SOURCE_ROLES) {
      expect(normalizeDeliveredBy(role)).toBe('specialist');
    }
  });

  it('maps teacher / admins / unknown → provider', () => {
    expect(normalizeDeliveredBy('teacher')).toBe('provider');
    expect(normalizeDeliveredBy('site_admin')).toBe('provider');
    expect(normalizeDeliveredBy('district_admin')).toBe('provider');
    expect(normalizeDeliveredBy('provider')).toBe('provider');
    expect(normalizeDeliveredBy('something_new')).toBe('provider');
  });

  it('normalizes casing and surrounding whitespace', () => {
    expect(normalizeDeliveredBy('  SEA ')).toBe('sea');
    expect(normalizeDeliveredBy('Speech')).toBe('specialist');
    expect(normalizeDeliveredBy(' OT ')).toBe('specialist');
  });

  it('defaults empty / falsy input to provider', () => {
    expect(normalizeDeliveredBy('')).toBe('provider');
    // Defensive: the signature is string, but guard against nullish at runtime.
    expect(normalizeDeliveredBy(undefined as unknown as string)).toBe('provider');
    expect(normalizeDeliveredBy(null as unknown as string)).toBe('provider');
  });
});
