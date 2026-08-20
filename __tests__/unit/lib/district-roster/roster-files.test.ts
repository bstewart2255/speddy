/**
 * SPE-447 · reading the district admin's two SEIS exports.
 *
 * The load-bearing property here is that a file Speddy cannot positively
 * identify never becomes a district's roster. A wrong file that parsed as
 * "generic" would import garbage names into every school at once, so the
 * Student Goals report must be RECOGNIZED, not merely parseable.
 *
 * All data is fictional.
 */

import { readDistrictRosterFiles } from '@/lib/district-roster/roster-files';

const GOALS_HEADER =
  'SEIS ID,SSID,District ID,Last Name,First Name,Birthdate,Grade,School of Attendance,' +
  'District of Service,Case Manager,IEP Date,Eligibility Status,Area Of Need,Annual Goal #,' +
  'Baseline,Goal,Purpose(s) of Goal,Standard,Person Responsible';

const goalsRow = (
  districtId: string,
  last: string,
  first: string,
  grade: string,
  school: string,
) =>
  `900,251,${districtId},${last},${first},01/05/2016,${grade},${school},JSUSD,C Mayer,` +
  '02/10/2026,SLD,Reading,Reading,At grade 1,' +
  '"Given a passage, the student will read 60 words per minute with 90% accuracy.",' +
  'Benefit,CCSS,Resource Specialist';

const DATES_HEADER =
  'SEIS ID,SSID,Last Name,First Name,Case Manager,School of Attendance,' +
  'Date of Next Annual Plan Review,Date of Next Reevaluation,' +
  'Date of IEP (Meeting Date on Current IEP Forms)';

// jsdom's File doesn't implement arrayBuffer(); the Node API runtime (where
// this code actually runs) does. Same shim the import suites use.
const fakeFile = (name: string, type: string, content: string): File =>
  ({
    name,
    type,
    size: content.length,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  }) as unknown as File;

const csvFile = (name: string, body: string): File => fakeFile(name, 'text/csv', body);

describe('readDistrictRosterFiles', () => {
  it('reads both reports into planner input', async () => {
    const result = await readDistrictRosterFiles({
      goalsFile: csvFile(
        'goals.csv',
        `${GOALS_HEADER}\n${goalsRow('100001', 'Alvarez', 'Ana', '1', 'Rodeo Hills Elementary')}`,
      ),
      datesFile: csvFile(
        'dates.csv',
        `${DATES_HEADER}\n2838067,2578106158,Alvarez,Ana,D Domich,Rodeo Hills Elementary,` +
          '02/09/2027,02/09/2029,02/10/2026',
      ),
      servicesFile: null,
      accommodationsFile: null,
      testingFile: null,
    });

    expect(result.error).toBeNull();
    expect(result.goalsStudents).toEqual([
      expect.objectContaining({
        firstName: 'Ana',
        lastName: 'Alvarez',
        gradeLevel: '1',
        districtStudentId: '100001',
        schoolOfAttendance: 'Rodeo Hills Elementary',
      }),
    ]);
    expect(result.datesRecords).toEqual([
      expect.objectContaining({
        firstName: 'Ana',
        lastName: 'Alvarez',
        schoolOfAttendance: 'Rodeo Hills Elementary',
        upcomingIepDate: '2027-02-09',
        upcomingTriennialDate: '2029-02-09',
      }),
    ]);
  });

  it('takes the IEP Dates report on its own — new referrals have no goals yet', async () => {
    const result = await readDistrictRosterFiles({
      goalsFile: null,
      datesFile: csvFile(
        'dates.csv',
        `${DATES_HEADER}\n1,2,Edsinger,Rex,D Domich,John Swett High,09/01/2026,,08/15/2025`,
      ),
      servicesFile: null,
      accommodationsFile: null,
      testingFile: null,
    });

    expect(result.error).toBeNull();
    expect(result.goalsStudents).toHaveLength(0);
    expect(result.datesRecords).toHaveLength(1);
    // That report carries no Grade column, which is why these students land as
    // planner exceptions rather than roster rows.
    expect(result.datesRecords[0].gradeLevel).toBe('');
  });

  it('normalizes a grade from the IEP Dates report to Speddy\'s own form', async () => {
    // That parser hands the cell back verbatim, unlike the Goals parser. A raw
    // "Kindergarten" would be written where the rest of Speddy stores 'K'.
    const result = await readDistrictRosterFiles({
      goalsFile: null,
      datesFile: csvFile(
        'dates.csv',
        'Last Name,First Name,School of Attendance,Grade,Date of Next Annual Plan Review\n' +
          'Alvarez,Ana,Rodeo Hills Elementary,Kindergarten,09/01/2026\n' +
          'Bishop,Ben,Rodeo Hills Elementary,3rd,09/02/2026',
      ),
      servicesFile: null,
      accommodationsFile: null,
      testingFile: null,
    });

    expect(result.error).toBeNull();
    expect(result.datesRecords.map((r) => r.gradeLevel)).toEqual(['K', '3']);
  });

  it('refuses a spreadsheet that is not the Student Goals report', async () => {
    const result = await readDistrictRosterFiles({
      goalsFile: csvFile(
        'roster.csv',
        'First Name,Last Name,Grade,Teacher\nAna,Alvarez,1,Ms Chen',
      ),
      datesFile: null,
      servicesFile: null,
      accommodationsFile: null,
      testingFile: null,
    });

    expect(result.error).toMatch(/does not look like the SEIS Student Goals report/);
    expect(result.goalsStudents).toHaveLength(0);
  });

  it('refuses a re-saved .xlsx — the identity check is CSV-only', async () => {
    const result = await readDistrictRosterFiles({
      goalsFile: fakeFile(
        'goals.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'not really xlsx',
      ),
      datesFile: null,
      servicesFile: null,
      accommodationsFile: null,
      testingFile: null,
    });

    expect(result.error).toMatch(/is not a CSV/);
  });

  it('names the file when the IEP Dates report cannot be read', async () => {
    const result = await readDistrictRosterFiles({
      goalsFile: null,
      datesFile: csvFile('dates.csv', 'Some Column,Another\n1,2'),
      servicesFile: null,
      accommodationsFile: null,
      testingFile: null,
    });

    expect(result.error).toMatch(/"dates\.csv" could not be read/);
  });

  it('refuses an empty upload rather than planning nothing', async () => {
    const result = await readDistrictRosterFiles({ goalsFile: null, datesFile: null, servicesFile: null, accommodationsFile: null, testingFile: null });
    expect(result.error).toMatch(/Upload at least one of your SEIS reports/);
  });

  it('caps the per-row notes it carries to the review screen', async () => {
    // 25 rows whose annual review date cannot be parsed: one warning each.
    const rows = Array.from(
      { length: 25 },
      (_, i) =>
        `1,2,Doe${i},Jan,D Domich,Rodeo Hills Elementary,13/45/2026,,08/15/2025`,
    ).join('\n');
    const result = await readDistrictRosterFiles({
      goalsFile: null,
      datesFile: csvFile('dates.csv', `${DATES_HEADER}\n${rows}`),
      servicesFile: null,
      accommodationsFile: null,
      testingFile: null,
    });

    expect(result.error).toBeNull();
    expect(result.warnings).toHaveLength(21);
    expect(result.warnings.at(-1)).toMatch(/5 more note\(s\) not listed/);
  });
});
