/**
 * Unit tests for the import confirm-route duplicate-detection key (SPE-245).
 *
 * The key must let a stored legacy SEIS grade (`grade_level` '18'/'0') dedup
 * against an incoming normalized 'TK'/'K', while keeping genuinely distinct
 * students distinct. All values here are fictional.
 */

import {
  buildStudentDedupKey,
  normalizeInitialsForKey,
} from '@/lib/utils/student-dedup-key';

describe('buildStudentDedupKey', () => {
  it('collapses legacy SEIS grades so 18/TK and 0/K dedup to the same key', () => {
    // The whole point: a DB row stored as '18' and an import row as 'TK' match.
    expect(buildStudentDedupKey('JS', '18')).toBe(buildStudentDedupKey('JS', 'TK'));
    expect(buildStudentDedupKey('AB', '0')).toBe(buildStudentDedupKey('AB', 'K'));
  });

  it('produces canonical grades (18 -> TK, 0 -> K, ordinary grades unchanged)', () => {
    expect(buildStudentDedupKey('JS', '18')).toBe('JS-TK');
    expect(buildStudentDedupKey('JS', '0')).toBe('JS-K');
    expect(buildStudentDedupKey('JS', '5')).toBe('JS-5');
    expect(buildStudentDedupKey('JS', 'TK')).toBe('JS-TK');
  });

  it('normalizes initials (case and punctuation) on both sides of the key', () => {
    // A raw DB initials value matches the import side's normalized initials.
    expect(buildStudentDedupKey('j.s.', '3')).toBe(buildStudentDedupKey('JS', '3'));
    expect(buildStudentDedupKey(' js ', '3')).toBe('JS-3');
  });

  it('keeps genuinely distinct students distinct', () => {
    expect(buildStudentDedupKey('JS', '3')).not.toBe(buildStudentDedupKey('JS', '4'));
    expect(buildStudentDedupKey('JS', 'TK')).not.toBe(buildStudentDedupKey('AB', 'TK'));
  });

  it('handles null/undefined initials and grade without throwing', () => {
    expect(buildStudentDedupKey(null, null)).toBe('-');
    expect(buildStudentDedupKey(undefined, '3')).toBe('-3');
    expect(buildStudentDedupKey('JS', undefined)).toBe('JS-');
  });
});

describe('normalizeInitialsForKey', () => {
  it('uppercases and strips non-letters', () => {
    expect(normalizeInitialsForKey('j.s.')).toBe('JS');
    expect(normalizeInitialsForKey(' a-b ')).toBe('AB');
    expect(normalizeInitialsForKey(null)).toBe('');
  });
});
