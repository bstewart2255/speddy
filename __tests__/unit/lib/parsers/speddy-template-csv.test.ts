/**
 * Golden-fixture tests for the Speddy roster-template CSV path (SPE-225):
 * parseCSVReport recognizing the Initials/Grade/Teacher template and mapping it
 * to goal-less students that carry teacher + schedule inline, so it flows
 * through the same server preview/confirm pipeline as SEIS files.
 */

import { parseCSVReport, detectSpeddyTemplateFormat } from '@/lib/parsers/csv-parser';
import { readFixture } from './fixtures/builders';

describe('detectSpeddyTemplateFormat', () => {
  it('detects the template by its Initials/Grade/Teacher header (case/space-tolerant)', () => {
    expect(
      detectSpeddyTemplateFormat([['Initials', 'Grade', 'Teacher', 'Sessions Per Week', 'Minutes Per Session']])
    ).toBe(true);
    expect(detectSpeddyTemplateFormat([[' initials ', 'GRADE', 'teacher']])).toBe(true);
  });

  it('does not treat a SEIS goals header or a generic CSV as a template', () => {
    expect(
      detectSpeddyTemplateFormat([['SEIS ID', 'District ID', 'Last Name', 'First Name', 'Birthdate', 'Grade']])
    ).toBe(false);
    expect(detectSpeddyTemplateFormat([['First Name', 'Last Name', 'Grade', 'Goal']])).toBe(false);
    expect(detectSpeddyTemplateFormat([])).toBe(false);
  });
});

describe('parseCSVReport — Speddy roster template', () => {
  it('parses the template fixture into goal-less students with inline teacher + schedule', async () => {
    const result = await parseCSVReport(readFixture('roster-template.csv'), {});

    expect(result.metadata.formatDetected).toBe('speddy-template');
    expect(result.errors).toHaveLength(0);
    expect(result.students).toHaveLength(5);

    const jd = result.students.find((s) => s.initials === 'JD');
    expect(jd).toMatchObject({
      initials: 'JD',
      gradeLevel: '3',
      firstName: '',
      lastName: '',
      goals: [],
      teacherName: 'Smith',
      sessionsPerWeek: 2,
      minutesPerSession: 30,
    });

    // Grade normalization runs (K stays K, numeric stays numeric).
    expect(result.students.find((s) => s.initials === 'AB')?.gradeLevel).toBe('K');
  });

  it('skips blank/partial rows and de-dupes Initials+Grade (keeps the first)', async () => {
    const csv = Buffer.from(
      [
        'Initials,Grade,Teacher,Sessions Per Week,Minutes Per Session',
        'JD,3,Smith,2,30',
        'JD,3,Jones,1,60', // duplicate initials+grade -> keep first
        ',,,,', // fully blank -> ignored silently
        'XY,,Nguyen,,', // partial (missing grade) -> warned + skipped
      ].join('\n'),
      'utf-8'
    );
    const result = await parseCSVReport(csv, {});

    expect(result.students).toHaveLength(1);
    expect(result.students[0].teacherName).toBe('Smith'); // first JD wins
    expect(result.warnings.some((w) => /duplicate/i.test(w.message))).toBe(true);
    expect(result.warnings.some((w) => /need Initials, Grade, and Teacher/i.test(w.message))).toBe(true);
  });

  it('treats sessions/minutes as optional', async () => {
    const csv = Buffer.from('Initials,Grade,Teacher\nJD,3,Smith', 'utf-8');
    const result = await parseCSVReport(csv, {});

    expect(result.metadata.formatDetected).toBe('speddy-template');
    expect(result.students[0]).toMatchObject({ initials: 'JD', teacherName: 'Smith' });
    expect(result.students[0].sessionsPerWeek).toBeUndefined();
    expect(result.students[0].minutesPerSession).toBeUndefined();
  });
});
