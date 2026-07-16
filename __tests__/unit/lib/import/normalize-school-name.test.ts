/**
 * Unit tests for the import-flow school-name normalizer (SPE-230).
 *
 * This is the copy extracted from the preview route — intentionally divergent
 * from lib/school-helpers.ts (see normalize-school-name.ts). The divergence
 * itself is pinned in __tests__/unit/lib/parsers/normalization.test.ts; here we
 * exercise the behavior directly.
 */
import { normalizeSchoolName } from '@/lib/import/normalize-school-name';

describe('normalizeSchoolName (import flow)', () => {
  it('lowercases and trims', () => {
    expect(normalizeSchoolName('  Lincoln  ')).toBe('lincoln');
    expect(normalizeSchoolName('BANCROFT')).toBe('bancroft');
  });

  it('expands "mt"/"mt." to "mount"', () => {
    expect(normalizeSchoolName('Mt Diablo Elementary')).toBe('mount diablo elementary');
    expect(normalizeSchoolName('Mt. Diablo Elementary')).toBe('mount diablo elementary');
  });

  it('expands "st"/"st." to "saint"', () => {
    expect(normalizeSchoolName('St Mary School')).toBe('saint mary');
    expect(normalizeSchoolName('St. Mary')).toBe('saint mary');
  });

  it('expands "elem"/"elem." to "elementary" mid-string and at end', () => {
    expect(normalizeSchoolName('Lincoln Elem School')).toBe('lincoln elementary');
    expect(normalizeSchoolName('Lincoln Elem')).toBe('lincoln elementary');
    expect(normalizeSchoolName('Lincoln Elem.')).toBe('lincoln elementary');
  });

  it('drops only a trailing "school" word', () => {
    expect(normalizeSchoolName('Bancroft Elementary School')).toBe('bancroft elementary');
    // "school" mid-string is not stripped.
    expect(normalizeSchoolName('School House Middle')).toBe('school house middle');
  });

  it('keeps the school-level word so different levels stay distinct', () => {
    expect(normalizeSchoolName('Washington Elementary')).not.toBe(normalizeSchoolName('Washington Middle'));
    expect(normalizeSchoolName('Washington Elementary')).toBe('washington elementary');
    expect(normalizeSchoolName('Washington Middle')).toBe('washington middle');
    expect(normalizeSchoolName('Washington High School')).toBe('washington high');
  });

  it('treats "X Elementary" and "X Elementary School" as the same school', () => {
    expect(normalizeSchoolName('Bancroft Elementary')).toBe(normalizeSchoolName('Bancroft Elementary School'));
  });

  it('is idempotent for the expanded forms', () => {
    for (const input of ['Mt Diablo Elementary School', 'St Mary School', 'Lincoln Elem', 'Washington Middle']) {
      const once = normalizeSchoolName(input);
      expect(normalizeSchoolName(once)).toBe(once);
    }
  });
});
