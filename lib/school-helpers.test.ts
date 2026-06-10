import { isSecondarySchool, getSchoolLevel, parseGradeLevel } from './school-helpers';

describe('parseGradeLevel', () => {
  it('maps pre-K / TK / Kindergarten to 0', () => {
    expect(parseGradeLevel('PK')).toBe(0);
    expect(parseGradeLevel('TK')).toBe(0);
    expect(parseGradeLevel('K')).toBe(0);
    expect(parseGradeLevel('KG')).toBe(0);
    expect(parseGradeLevel('Kindergarten')).toBe(0);
  });

  it('parses numeric grades, ignoring case/whitespace', () => {
    expect(parseGradeLevel('1')).toBe(1);
    expect(parseGradeLevel(' 6 ')).toBe(6);
    expect(parseGradeLevel('12')).toBe(12);
  });

  it('returns null for empty or unrecognized values', () => {
    expect(parseGradeLevel(null)).toBeNull();
    expect(parseGradeLevel(undefined)).toBeNull();
    expect(parseGradeLevel('')).toBeNull();
    expect(parseGradeLevel('???')).toBeNull();
  });
});

describe('isSecondarySchool', () => {
  it('treats explicit Middle / High labels as secondary', () => {
    expect(isSecondarySchool({ school_type: 'Middle' })).toBe(true);
    expect(isSecondarySchool({ school_type: 'High' })).toBe(true);
    expect(isSecondarySchool({ school_type: 'High School' })).toBe(true);
    expect(isSecondarySchool({ school_type: 'Junior High' })).toBe(true);
    expect(isSecondarySchool({ school_type: 'Secondary' })).toBe(true);
  });

  it('treats Elementary and combined K-8 / K-12 sites as elementary', () => {
    expect(isSecondarySchool({ school_type: 'Elementary' })).toBe(false);
    expect(isSecondarySchool({ school_type: 'K-8' })).toBe(false);
    expect(isSecondarySchool({ school_type: 'K-12' })).toBe(false);
  });

  it('lets the explicit school_type win over grade span', () => {
    // Explicit Middle beats an (incorrectly entered) elementary span.
    expect(isSecondarySchool({ school_type: 'Middle', grade_span_low: 'K' })).toBe(true);
    // Explicit Elementary beats a high span.
    expect(isSecondarySchool({ school_type: 'Elementary', grade_span_low: '9' })).toBe(false);
  });

  it('falls back to grade span when the type is missing or Other', () => {
    expect(isSecondarySchool({ grade_span_low: '6' })).toBe(true);
    expect(isSecondarySchool({ grade_span_low: '5' })).toBe(false);
    expect(isSecondarySchool({ school_type: 'Other', grade_span_low: '7' })).toBe(true);
    expect(isSecondarySchool({ school_type: 'Other', grade_span_low: 'K' })).toBe(false);
  });

  it('defaults to elementary when nothing usable is set', () => {
    expect(isSecondarySchool(null)).toBe(false);
    expect(isSecondarySchool(undefined)).toBe(false);
    expect(isSecondarySchool({})).toBe(false);
    expect(isSecondarySchool({ school_type: 'Other' })).toBe(false);
  });
});

describe('getSchoolLevel', () => {
  it('returns the matching level label', () => {
    expect(getSchoolLevel({ school_type: 'High' })).toBe('secondary');
    expect(getSchoolLevel({ school_type: 'Elementary' })).toBe('elementary');
    expect(getSchoolLevel(null)).toBe('elementary');
  });
});
