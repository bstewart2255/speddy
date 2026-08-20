/**
 * Tests for the three district-wide SEIS report parsers (SPE-575): Services,
 * Accommodations, and the Student Download of testing accommodations.
 *
 * Fixtures are built in-memory with ExcelJS using the REAL files' header rows
 * (verified against the JSUSD 2026-08-20 exports) and fictional students, so
 * the tests pin the exact column shapes SEIS emits without carrying any real
 * student data.
 */

import * as ExcelJS from 'exceljs';
import {
  parseServicesReport,
  parseAccommodationsReport,
  parseTestingAccommodationsReport,
  testingAccommodationLabel,
} from '@/lib/parsers/district-reports';

async function xlsxBuffer(rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet 1');
  for (const row of rows) sheet.addRow(row);
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

// The real Services report header row (17 columns).
const SERVICES_HEADERS = [
  'SEIS ID',
  'SSID',
  'Student Legal First Name',
  'Student Legal Last Name',
  'Student Birth Date',
  'Enrollment Date',
  'Reporting LEA',
  'District of Special Education Accountability',
  'School of Attendance',
  'Grade',
  'Case Manager',
  'Special Education Service Code',
  'Special Education Service Provider Code',
  'Nonpublic Agency Identifier (NPA)',
  'Special Education Service Location Code',
  'Service Duration',
  'Service Frequency Code',
];

const servicesRow = (
  first: string,
  last: string,
  service: string,
  duration: string,
  frequency: string,
  overrides: Partial<Record<'grade' | 'school' | 'dob' | 'cm', string>> = {},
) => [
  '1234567',
  '9999999999',
  first,
  last,
  overrides.dob ?? '03/02/2013',
  '08/13/2026',
  'Fictional Unified School District',
  'Fictional Unified School District',
  overrides.school ?? 'Fictional Middle',
  overrides.grade ?? 'Eighth grade',
  overrides.cm ?? 'Casey Manager',
  service,
  '100 - District of Service',
  '',
  '520 - Separate classroom in public integrated facility',
  duration,
  frequency,
];

describe('parseServicesReport', () => {
  it('reads services with total-minutes durations and converts to weekly', async () => {
    const buffer = await xlsxBuffer([
      SERVICES_HEADERS,
      servicesRow('Pat', 'Example', '415 - Language and Speech', '750', '40 - Yearly (one or more times a year)'),
      servicesRow('Pat', 'Example', '450 - Occupational therapy', '30', '20 - Weekly (one or more times a week)'),
      // A split service: same code on two lines — both kept, never collapsed.
      servicesRow('Sam', 'Sample', '330 - Specialized Academic Instruction', '285', '20 - Weekly (one or more times a week)'),
      servicesRow('Sam', 'Sample', '330 - Specialized Academic Instruction', '570', '20 - Weekly (one or more times a week)'),
      servicesRow('Sam', 'Sample', '510 - Individual  counseling', '120', '30 - Monthly (one or more times a month)'),
    ]);

    const result = await parseServicesReport(buffer);
    expect(result.metadata.formatDetected).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.students).toHaveLength(2);

    const pat = result.students.find((s) => s.firstName === 'Pat')!;
    expect(pat.gradeLevel).toBe('8');
    expect(pat.schoolOfAttendance).toBe('Fictional Middle');
    expect(pat.dateOfBirth).toBe('2013-03-02');
    expect(pat.caseManager).toBe('Casey Manager');
    expect(pat.services).toEqual([
      // 750 min yearly ÷ 36 weeks, rounded up.
      { code: '415', name: 'Language and Speech', minutes: 750, frequency: 'yearly', weeklyMinutes: 21 },
      { code: '450', name: 'Occupational therapy', minutes: 30, frequency: 'weekly', weeklyMinutes: 30 },
    ]);

    const sam = result.students.find((s) => s.firstName === 'Sam')!;
    expect(sam.services.map((line) => line.weeklyMinutes)).toEqual([285, 570, 30]);
    expect(sam.services.filter((line) => line.code === '330')).toHaveLength(2);
  });

  it('skips unreadable service rows with a warning instead of inventing numbers', async () => {
    const buffer = await xlsxBuffer([
      SERVICES_HEADERS,
      servicesRow('Pat', 'Example', '415 - Language and Speech', 'n/a', '20 - Weekly (one or more times a week)'),
      servicesRow('Pat', 'Example', '415 - Language and Speech', '30', '20 - Weekly (one or more times a week)'),
    ]);

    const result = await parseServicesReport(buffer);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].services).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('could not be read');
    // Warnings carry initials only, never a full name.
    expect(result.warnings[0].message).not.toContain('Example');
  });

  it('refuses a file without the Services report columns', async () => {
    const buffer = await xlsxBuffer([
      ['SEIS ID', 'District ID', 'Last Name', 'First Name', 'Grade', 'Goal'],
      ['1', '2', 'Example', 'Pat', '4', 'A goal'],
    ]);
    const result = await parseServicesReport(buffer);
    expect(result.metadata.formatDetected).toBe(false);
    expect(result.students).toEqual([]);
    expect(result.errors[0].message).toContain('does not look like the SEIS Services report');
  });

  it('reads a CSV re-save of the same report', async () => {
    const csv = [
      SERVICES_HEADERS.join(','),
      '1234567,9999999999,Pat,Example,03/02/2013,08/13/2026,Fictional USD,Fictional USD,Fictional Middle,Eighth grade,Casey Manager,415 - Language and Speech,100 - District of Service,,520 - Separate classroom,30,20 - Weekly (one or more times a week)',
    ].join('\n');
    const result = await parseServicesReport(Buffer.from(csv, 'utf-8'));
    expect(result.metadata.formatDetected).toBe(true);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].services[0]).toMatchObject({ code: '415', weeklyMinutes: 30 });
  });
});

// The real Accommodations report header row (24 columns).
const ACCOMMODATIONS_HEADERS = [
  'SEIS ID',
  'District ID',
  'Last Name',
  'First Name',
  'DOB',
  'Grade',
  'School of Attendance',
  'Eligibility Status',
  'Case Manager',
  'Reporting LEA',
  'IEP Date',
  'Disability 1',
  'Disability 2',
  'Category',
  'Non-Exhaustive List to Consider for Instruction',
  'Other Text box 1',
  'Other Text box 2',
  'List of Accommodations to Consider for Assessment',
  'To Support Student/Personnel',
  'Start Date',
  'End Date',
  'Frequency',
  'Duration',
  'Location',
];

const accommodationRow = (
  first: string,
  last: string,
  category: string,
  listValue: string,
  other1 = '',
  other2 = '',
  assessment = '',
) => [
  '7654321',
  'D-1001',
  last,
  first,
  '11/30/2011',
  '09',
  'Fictional High',
  'Yes',
  'Casey Manager',
  'Fictional Unified School District',
  '01/22/2026',
  'Autism (AUT)',
  '',
  category,
  listValue,
  other1,
  other2,
  assessment,
  '',
  '02/06/2026',
  '02/05/2027',
  '',
  '',
  'All classroom settings',
];

describe('parseAccommodationsReport', () => {
  it('composes entries from the picklist and Other text boxes', async () => {
    const buffer = await xlsxBuffer([
      ACCOMMODATIONS_HEADERS,
      // "Other" → the real text is in box 1.
      accommodationRow('Ash', 'Fictional', 'Accommodation', 'Other', 'Noise cancelling headphones'),
      // A real picklist value alone.
      accommodationRow('Ash', 'Fictional', 'Accommodation', 'Extended time'),
      // Picklist + elaboration → kept together.
      accommodationRow('Ash', 'Fictional', 'Accommodation', 'Consultation between', 'SLP and classroom teacher'),
      // Box 2 is its own entry.
      accommodationRow('Ash', 'Fictional', 'Accommodation', 'Other', 'Visual schedule', 'Sensory breaks'),
      // Category is kept on non-accommodation rows.
      accommodationRow('Ash', 'Fictional', 'Modification', 'Other', 'Shortened assignments'),
      accommodationRow('Ash', 'Fictional', 'Other Supports', 'Other', 'Adult supervision at recess'),
      // Assessment-list rows land on the testing list, not the classroom list.
      accommodationRow('Ash', 'Fictional', 'Accommodation', '', '', '', 'Text-to-Speech (Reading Passages)'),
      // Duplicate + empty rows are dropped.
      accommodationRow('Ash', 'Fictional', 'Accommodation', 'Extended time'),
      accommodationRow('Ash', 'Fictional', 'Accommodation', 'Other'),
    ]);

    const result = await parseAccommodationsReport(buffer);
    expect(result.metadata.formatDetected).toBe(true);
    expect(result.students).toHaveLength(1);

    const student = result.students[0];
    expect(student.districtStudentId).toBe('D-1001');
    expect(student.gradeLevel).toBe('9');
    expect(student.dateOfBirth).toBe('2011-11-30');
    expect(student.accommodations).toEqual([
      'Noise cancelling headphones',
      'Extended time',
      'Consultation between: SLP and classroom teacher',
      'Visual schedule',
      'Sensory breaks',
      'Modification: Shortened assignments',
      'Support: Adult supervision at recess',
    ]);
    expect(student.testingAccommodations).toEqual(['Text-to-Speech (Reading Passages)']);
    // The one no-text row is counted once, not warned per row.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('1 accommodation row(s)');
  });

  it('refuses a file without the Accommodations report columns', async () => {
    const buffer = await xlsxBuffer([SERVICES_HEADERS, servicesRow('A', 'B', '415 - x', '30', '20 - Weekly')]);
    const result = await parseAccommodationsReport(buffer);
    expect(result.metadata.formatDetected).toBe(false);
    expect(result.errors[0].message).toContain('does not look like the SEIS Accommodations report');
  });
});

// A representative slice of the real Student Download header row: identity
// columns then accommodation columns with embedded newlines and annotations.
const TESTING_HEADERS = [
  'Student SSID (Example: 1234567890)',
  'SEIS ID',
  'FirstName',
  'LastName',
  'Birthdate',
  'Reporting LEA',
  'School',
  'School Type',
  'GradeLevel',
  'Case Manager',
  'Abacus (NON-EMBEDDED) (Computer – M, S, CM, CS) (Paper – M, S)',
  'Masking (EMBEDDED)\n(Computer – E, M, S, CE, CM, CS, RO)',
  'Multiplication Table (NON-EMBEDDED)\n(Computer – M, CM)(Paper – M)',
  'Multiplication Table (NON-EMBEDDED)(Computer – S, CS)(Paper – S)',
  '*Noise Buffers (NON-EMBEDDED) (Computer – E, M, S, CE, CM, CS, RO)(Paper – E, M, S)',
  'Separate Setting (NON-EMBEDDED) (Computer – E, M, S, CE, CM, CS, RO)(Paper – E, M, S)',
  '*Speech-to-Text (NON-EMBEDDED) (Computer – E, M, S, RO)(Paper –  E, M, S)',
  '*Text-to-Speech (EMBEDDED)\n(Computer – E, M)',
  'Bilingual Dictionary (ET) (NON-EMBEDDED)\n(Computer – M, S)',
  'Translated Test Directions (ET) (PDF on the CAASPP & ELPAC Website) (NON-EMBEDDED)',
];

describe('parseTestingAccommodationsReport', () => {
  it('builds readable entries from column headers, ignoring the TOMS codes in cells', async () => {
    const buffer = await xlsxBuffer([
      TESTING_HEADERS,
      [
        '9999999999', '1234567', 'Pat', 'Example', '03/02/2013',
        'Fictional Unified School District', 'Fictional Middle', 'Public day school ', 'Eighth grade', 'Casey Manager',
        '', 'NEA_MT', 'NEDS_MT', 'NEDS_MT_SCI', '', 'NEDS_SS', '', 'TDS_TTS_ALL', '', '',
      ],
      [
        '8888888888', '7654321', 'Sam', 'Sample', '05/04/2013',
        'Fictional Unified School District', 'Fictional Middle', 'Public day school ', 'Seventh grade', '',
        '', '', '', '', '', '', '', '', '', '',
      ],
    ]);

    const result = await parseTestingAccommodationsReport(buffer);
    expect(result.metadata.formatDetected).toBe(true);
    expect(result.students).toHaveLength(2);

    const pat = result.students.find((s) => s.firstName === 'Pat')!;
    expect(pat.gradeLevel).toBe('8');
    expect(pat.schoolOfAttendance).toBe('Fictional Middle');
    expect(pat.testingAccommodations).toEqual([
      'Masking (embedded)',
      // The two Multiplication Table columns (Math and Science) collapse into
      // one readable entry.
      'Multiplication Table (non-embedded)',
      'Separate Setting (non-embedded)',
      'Text-to-Speech (embedded)',
    ]);

    const sam = result.students.find((s) => s.firstName === 'Sam')!;
    expect(sam.testingAccommodations).toEqual([]);
  });

  it('refuses the TOMS upload file, which has no student names', async () => {
    const buffer = await xlsxBuffer([
      ['Student SSID (Example: 1234567890)', 'Masking (EMBEDDED)', 'Abacus (NON-EMBEDDED)'],
      ['9999999999', 'NEA_MT', ''],
    ]);
    const result = await parseTestingAccommodationsReport(buffer);
    expect(result.metadata.formatDetected).toBe(false);
    expect(result.errors[0].message).toContain('Student Download');
  });
});

describe('testingAccommodationLabel', () => {
  it.each([
    ['Masking (EMBEDDED)\n(Computer – E, M, S, CE, CM, CS, RO)', 'Masking (embedded)'],
    ['*Noise Buffers (NON-EMBEDDED) (Computer – E, M, S)(Paper – E, M, S)', 'Noise Buffers (non-embedded)'],
    ['*Scribe (Writing) (NON-EMBEDDED)\n(Computer – E, M)', 'Scribe (Writing) (non-embedded)'],
    ['Bilingual Dictionary (ET) (NON-EMBEDDED)\n(Computer – M, S)', 'Bilingual Dictionary (non-embedded)'],
    [
      'Translated Test Directions (ET) (PDF on the CAASPP & ELPAC Website) (NON-EMBEDDED)',
      'Translated Test Directions (non-embedded)',
    ],
    [
      'Specialized Calculator (Grades 6–8 and Grade 11) (NON-EMBEDDED) (Computer – M)(Paper – M)',
      'Specialized Calculator (Grades 6–8 and Grade 11) (non-embedded)',
    ],
    [
      'Dual-Language Translations and Translated Test Directions in Spanish (EMBEDDED)(Computer – M)',
      'Dual-Language Translations and Translated Test Directions in Spanish (embedded)',
    ],
  ])('%s → %s', (header, expected) => {
    expect(testingAccommodationLabel(header)).toBe(expected);
  });
});
