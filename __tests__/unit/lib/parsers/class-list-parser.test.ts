/**
 * Golden-fixture tests for the Aeries Class List TXT parser (SPE-239).
 * Pins parseTeacherName across every real teacher-header format and the full
 * parseClassListTXT result over a fictional two-page fixture with banners,
 * repeated column-header lines, a co-teacher, quoted comma-names, 900-series
 * teacher numbers, hyphenated / two-word student last names, trailing-space
 * birthdate fields, and a student repeated across pages (dedup).
 */

import {
  parseTeacherName,
  parseClassListTXT,
  ClassListParseResult,
} from '@/lib/parsers/class-list-parser';
import { readFixture } from './fixtures/builders';

function serialize(result: ClassListParseResult) {
  return {
    students: Array.from(result.students.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // locale-independent for stable snapshots
      .map(([key, s]) => ({
        key,
        name: s.name,
        teacher: s.teacher,
      })),
    teachers: result.teachers,
    errors: result.errors,
    warnings: result.warnings,
    metadata: result.metadata,
  };
}

describe('parseTeacherName', () => {
  it('handles space-separated "LastName Initial"', () => {
    expect(parseTeacherName('Barrera E')).toEqual({ lastName: 'Barrera', firstInitial: 'E' });
  });

  it('handles last-name-only', () => {
    expect(parseTeacherName('Batra')).toEqual({ lastName: 'Batra', firstInitial: null });
  });

  it('uses the first teacher for a co-teacher "Davis/Winbery"', () => {
    expect(parseTeacherName('Davis/Winbery')).toEqual({ lastName: 'Davis', firstInitial: null });
  });

  it('handles comma-separated "LastName,Initial"', () => {
    expect(parseTeacherName('Khristo,G')).toEqual({ lastName: 'Khristo', firstInitial: 'G' });
    expect(parseTeacherName('Massey,C')).toEqual({ lastName: 'Massey', firstInitial: 'C' });
  });

  it('returns empty for non-string / empty input', () => {
    expect(parseTeacherName('')).toEqual({ lastName: '', firstInitial: null });
    // @ts-expect-error exercising the runtime guard
    expect(parseTeacherName(undefined)).toEqual({ lastName: '', firstInitial: null });
  });
});

describe('parseClassListTXT', () => {
  it('matches the golden snapshot', async () => {
    const result = await parseClassListTXT(readFixture('class-list.txt'));
    expect(serialize(result)).toMatchSnapshot();
  });

  it('deduplicates a student repeated across pages, keeping the first teacher', async () => {
    const result = await parseClassListTXT(readFixture('class-list.txt'));
    const ana = result.students.get('alvarez_ana');
    expect(ana).toBeDefined();
    // Ana appears under Barrera (page 1) and Khristo (page 2); first wins.
    expect(ana!.teacher.lastName).toBe('Barrera');
  });

  it('captures all five distinct teachers including co-teacher and quoted names', async () => {
    const result = await parseClassListTXT(readFixture('class-list.txt'));
    expect(result.teachers.map((t) => t.lastName).sort()).toEqual([
      'Barrera',
      'Batra',
      'Davis',
      'Khristo',
      'Massey',
    ]);
  });
});
