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
        districtStudentId: s.districtStudentId,
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

  // SPE-339: field 2 of each student row is the district's own Student ID. The
  // name is quoted (it contains a comma), so the id has to be read from what
  // follows the closing quote, not from a naive comma split.
  it("captures each student's district Student ID from behind the quoted name", async () => {
    const result = await parseClassListTXT(readFixture('class-list.txt'));
    expect(result.students.get('alvarez_ana')!.districtStudentId).toBe('100001');
    expect(result.students.get('bishop_ben')!.districtStudentId).toBe('100002');
    // A hyphenated two-word last name still splits correctly.
    expect(result.students.get('davis-wong_drew')!.districtStudentId).toBe('100004');
  });

  it('leaves the id null for a row that carries only a name', async () => {
    const result = await parseClassListTXT(
      Buffer.from('Teacher#,101,Teacher: Barrera E\n"Solo, Sam"\n', 'utf-8'),
    );
    const sam = result.students.get('solo_sam');
    expect(sam).toBeDefined();
    expect(sam!.districtStudentId).toBeNull();
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
