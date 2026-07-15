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

  it('defers a file that has roster columns AND a goal column to SEIS/generic', () => {
    // Same Initials/Grade/Teacher headers but also carrying goals — not a bare
    // roster, so the goal-less template parser must not claim it.
    expect(detectSpeddyTemplateFormat([['Initials', 'Grade', 'Teacher', 'IEP Goal']])).toBe(false);
    expect(detectSpeddyTemplateFormat([['Initials', 'Grade', 'Teacher', 'Present Levels']])).toBe(false);
    expect(detectSpeddyTemplateFormat([['Initials', 'Grade', 'Teacher', 'Objective']])).toBe(false);
  });
});

describe('parseCSVReport — incomplete roster template (SPE-250)', () => {
  it('gives a roster-specific error when Initials is present but a required column is missing/misnamed', async () => {
    // "Teacher" mistyped as "Teacher Name" — fails template detection and would
    // otherwise fall through to the SEIS/generic name-column error.
    const csv = Buffer.from('Initials,Grade,Teacher Name\nJD,3,Smith', 'utf-8');
    const result = await parseCSVReport(csv, {});

    expect(result.students).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/roster template/i);
    expect(result.errors[0].message).toMatch(/Teacher/);
    // Names the roster requirement, not the SEIS/generic name-column guidance.
    expect(result.errors[0].message).not.toMatch(/First Name, Last Name/);
  });

  it('names every missing required roster column', async () => {
    // Only Initials present (Grade + Teacher missing).
    const csv = Buffer.from('Initials,Room\nJD,12', 'utf-8');
    const result = await parseCSVReport(csv, {});

    expect(result.errors[0].message).toMatch(/Grade/);
    expect(result.errors[0].message).toMatch(/Teacher/);
  });

  it('does not hijack a genuine SEIS/generic file (no Initials column)', async () => {
    // Missing a grade column but clearly not a roster — keeps the name/grade guidance.
    const csv = Buffer.from('First Name,Last Name,Age\nJane,Doe,8', 'utf-8');
    const result = await parseCSVReport(csv, {});

    expect(result.errors[0].message).toMatch(/First Name, Last Name/);
    expect(result.errors[0].message).not.toMatch(/roster template/i);
  });

  it('does not claim a roster when a name-based file also carries an Initials column', async () => {
    // A genuine name-based file with an extra Initials column (First Name at
    // index 0 trips detectColumnMapping's falsy-index quirk into the error
    // branch) must keep the name guidance, not be mislabeled a roster.
    const csv = Buffer.from('First Name,Last Name,Initials,Age\nJane,Doe,JD,8', 'utf-8');
    const result = await parseCSVReport(csv, {});

    expect(result.errors[0].message).not.toMatch(/roster template/i);
    expect(result.errors[0].message).toMatch(/First Name, Last Name/);
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

  it('skips rows whose initials are not 2–4 letters (mirrors the confirm-route rule)', async () => {
    const csv = Buffer.from(
      [
        'Initials,Grade,Teacher',
        'J,3,Smith', // 1 letter -> skipped
        'JD,3,Smith', // ok
        'ABCDE,3,Smith', // 5 letters -> skipped
      ].join('\n'),
      'utf-8'
    );
    const result = await parseCSVReport(csv, {});

    expect(result.students).toHaveLength(1);
    expect(result.students[0].initials).toBe('JD');
    expect(result.warnings.filter((w) => /2.4 letters/.test(w.message))).toHaveLength(2);
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
