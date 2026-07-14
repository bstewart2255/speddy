/**
 * Golden-fixture builders for the import parser layer (SPE-239).
 *
 * ALL DATA HERE IS FICTIONAL. The real SEIS/Aeries/Deliveries exports contain
 * student names, birthdates, and SEIS IDs and must never enter the repo, tests,
 * or tickets. These builders mirror the *shape* of the verified real exports
 * (column order, header quirks, encoding quirks) using invented values only.
 *
 * Byte-precise fixtures (UTF-8 BOM prefix, Windows-1252 re-encoding, binary
 * XLSX workbooks) are generated here rather than committed as opaque files so a
 * reviewer can confirm no real data is present. Plain-text fixtures that read
 * naturally as files live alongside this module as .csv / .txt.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

const FIXTURE_DIR = __dirname;

/** Read a stored plain-text fixture file as a UTF-8 Buffer. */
export function readFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURE_DIR, name));
}

// ---------------------------------------------------------------------------
// SEIS Student Goals Report — 59-column layout
// ---------------------------------------------------------------------------

/**
 * The 59 columns of a SEIS Student Goals Report, in the verified real order.
 * The parser only reads fixed positions (Last Name @ 2, First Name @ 3,
 * Grade @ 5, School @ 6, IEP Date @ 9, Area Of Need @ 11, Annual Goal # @ 12,
 * Goal @ 14, Person Responsible @ 17); the remaining columns exist so the
 * fixture reproduces the real file's width, its six progress-report blocks
 * with trailing-space header names, and its "Objective"/"Goal Met" columns
 * (which trip the goal-column trap in the XLSX detector).
 */
export const SEIS_HEADERS: string[] = [
  'SEIS ID', // 0
  'District ID', // 1
  'Last Name', // 2
  'First Name', // 3
  'Birthdate', // 4
  'Grade', // 5
  'School of Attendance', // 6
  'District of Service', // 7
  'Case Manager', // 8
  'IEP Date', // 9
  'Eligibility Status', // 10
  'Area Of Need', // 11
  'Annual Goal #', // 12
  'Baseline', // 13
  'Goal', // 14
  'Purpose(s) of Goal', // 15
  'Standard', // 16
  'Person Responsible', // 17
  'Objective 1', // 18
  'Objective 1 Met', // 19
  'Objective 1 Date Met', // 20
  'Objective 2', // 21
  'Objective 2 Met', // 22
  'Objective 2 Date Met', // 23
  'Objective 3', // 24
  'Objective 3 Met', // 25
  'Objective 3 Date Met', // 26
  'Progress Report 1 Summary ', // 27  (trailing space, as in the real export)
  'Progress Report 1 Comments  ', // 28  (two trailing spaces)
  'Progress Report 2 Summary ', // 29
  'Progress Report 2 Comments  ', // 30
  'Progress Report 3 Summary ', // 31
  'Progress Report 3 Comments  ', // 32
  'Progress Report 4 Summary ', // 33
  'Progress Report 4 Comments  ', // 34
  'Progress Report 5 Summary ', // 35
  'Progress Report 5 Comments  ', // 36
  'Progress Report 6 Summary ', // 37
  'Progress Report 6 Comments  ', // 38
  'Goal Met', // 39
  'Created By', // 40
  'Created Date', // 41
  'Last Modified By', // 42
  'Last Modified Date', // 43
  'Reporting Progress', // 44
  'Comparison To Goal', // 45
  'Progress Percentage', // 46
  'Grade Level Standard', // 47
  'Curriculum', // 48
  'Frequency', // 49
  'Assessment Method', // 50
  'Owner', // 51
  'Owner Email', // 52
  'Case Manager Email', // 53
  'Record Locked', // 54
  'Record Status', // 55
  'Source System', // 56
  'Export Batch', // 57
  'Export Timestamp', // 58
];

/** A single SEIS row: fill known positions, blank everywhere else. */
type SparseRow = Record<number, string>;

/**
 * Fictional SEIS Student Goals rows exercising the documented edge cases:
 * grades 01–05 and 18; Mt Diablo / St Mary / Out-of-District schools;
 * Annual Goal # values over 10 chars; an embedded-newline goal; a blank
 * Area of Need + blank Annual Goal # row; a Handwriting area (keyword
 * cross-contamination with the resource "writing" keyword); a "Receptive
 * Languge" metadata typo; goal-like text in Person Responsible; and a
 * duplicate student whose second goal must merge into the first.
 */
const SEIS_GOALS_ROWS: SparseRow[] = [
  {
    0: '2000001', 2: 'Alvarez', 3: 'Ana', 5: '01', 6: 'Mt Diablo Elementary School',
    9: '05/01/2026', 11: 'Reading', 12: 'Academic #1: 2026 - 2027',
    14: 'By 5/1/2027, given a grade-level passage, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
    17: 'Resource Specialist',
  },
  {
    0: '2000002', 2: 'Bishop', 3: 'Ben', 5: '02', 6: 'St Mary School',
    9: '10/15/2025', 11: 'Math', 12: 'Academic #2: 2025 - 2026',
    14: 'By 10/15/2026, given manipulatives, Ben will solve two-digit addition problems with 80% accuracy across 3 sessions.',
    17: 'Resource Specialist and General Education Teacher',
  },
  {
    0: '2000003', 2: 'Cho', 3: 'Cora', 5: '03', 6: 'Mt Diablo Elementary School',
    9: '01/20/2026', 11: 'Speech/Language', 12: 'Speech (1 of 1)',
    14: 'By 1/20/2027, Cora will produce /r/ in structured sentences with 80% accuracy in 4 of 5 trials.',
    17: 'Speech Language Pathologist',
  },
  {
    0: '2000004', 2: 'Diaz', 3: 'Drew', 5: '04', 6: 'Out of District- MOU',
    9: '02/10/2026', 11: 'Social/Emotional', 12: 'Behavior (1 of 2)',
    14: 'By 2/10/2027, Drew will use a coping strategy when frustrated in 4 of 5 observed opportunities.',
    17: 'School Counselor',
  },
  {
    0: '2000005', 2: 'Evans', 3: 'Ella', 5: '05', 6: 'Mt Diablo Elementary School',
    9: '03/05/2026', 11: 'Fine Motor', 12: 'OT (1 of 1)',
    14: 'By 3/5/2027, Ella will copy a five-word sentence legibly within 5 minutes in 4 of 5 trials.',
    17: 'Occupational Therapist',
  },
  {
    // Grade 18 -> TK (CSV copy only); Handwriting area cross-contaminates the
    // resource "writing" keyword; Person Responsible = OT so it also matches OT.
    0: '2000006', 2: 'Foster', 3: 'Finn', 5: '18', 6: 'Mt Diablo Elementary School',
    9: '04/12/2026', 11: 'Handwriting', 12: 'Academic #3',
    14: 'By 4/12/2027, Finn will form lower-case letters with correct size and spacing in 4 of 5 samples.',
    17: 'Occupational Therapist',
  },
  {
    // Blank Area of Need + blank Annual Goal # + blank Person Responsible:
    // filtered out for every keyworded role.
    0: '2000007', 2: 'Gomez', 3: 'Gia', 5: '01', 6: 'Mt Diablo Elementary School',
    9: '05/09/2026', 11: '', 12: '',
    14: 'By 5/9/2027, Gia will raise her hand and wait to be called on in 4 of 5 opportunities.',
    17: '',
  },
  {
    // "Receptive Languge" typo does not contain "language" -> lost for speech.
    0: '2000008', 2: 'Hunt', 3: 'Hana', 5: '02', 6: 'Mt Diablo Elementary School',
    9: '01/30/2026', 11: 'Receptive Languge', 12: 'Comm (1 of 1)',
    14: 'By 1/30/2027, Hana will answer wh- questions about a short story with 80% accuracy.',
    17: 'Case Manager',
  },
  {
    // Goal-like text in Person Responsible.
    0: '2000009', 2: 'Ingram', 3: 'Ivan', 5: '03', 6: 'Mt Diablo Elementary School',
    9: '02/22/2026', 11: 'Written Expression', 12: 'Academic #1',
    14: 'By 2/22/2027, Ivan will write a three-sentence paragraph with a topic sentence in 4 of 5 samples.',
    17: 'the student will write a paragraph with support',
  },
  {
    // Embedded newline inside the goal cell.
    0: '2000010', 2: 'Jones', 3: 'Jae', 5: '04', 6: 'Mt Diablo Elementary School',
    9: '03/18/2026', 11: 'Reading', 12: 'Academic #1',
    14: 'By 6/1/2027 Jae will:\n- decode multisyllabic words\n- read 100 wpm with 95% accuracy',
    17: 'Resource Specialist',
  },
  {
    // Duplicate of Alvarez, Ana (grade 01): second goal must merge into the first.
    0: '2000001', 2: 'Alvarez', 3: 'Ana', 5: '01', 6: 'Mt Diablo Elementary School',
    9: '05/01/2026', 11: 'Written', 12: 'Academic #2',
    14: 'By 5/1/2027, Ana will write a personal narrative with a beginning, middle, and end in 4 of 5 samples.',
    17: 'Resource Specialist',
  },
];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function seisCsvLine(values: SparseRow, headers: string[] = SEIS_HEADERS): string {
  return headers.map((_, i) => csvCell(values[i] ?? '')).join(',');
}

/** Build the SEIS Student Goals Report CSV body (no BOM), \r\n line endings. */
function buildSeisGoalsCsv(): string {
  const lines = [
    SEIS_HEADERS.map(csvCell).join(','),
    ...SEIS_GOALS_ROWS.map((r) => seisCsvLine(r)),
  ];
  return lines.join('\r\n');
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** SEIS goals CSV without a BOM. */
export const SEIS_GOALS_CSV = (): Buffer => Buffer.from(buildSeisGoalsCsv(), 'utf-8');

/** SEIS goals CSV prefixed with a UTF-8 BOM, as the real export ships. */
export const SEIS_GOALS_CSV_BOM = (): Buffer =>
  Buffer.concat([UTF8_BOM, Buffer.from(buildSeisGoalsCsv(), 'utf-8')]);

/**
 * A column-shifted SEIS export (every column moved right by one) so the fixed
 * position detector matches fewer than 5 of its 6 key columns and falls back
 * to the generic parser. Pins the 5-of-6 detection boundary at the file level.
 */
function buildSeisGoalsShiftedCsv(): string {
  const shiftedHeaders = ['Row #', ...SEIS_HEADERS];
  const shift = (v: SparseRow): SparseRow => {
    const out: SparseRow = {};
    for (const k of Object.keys(v)) out[Number(k) + 1] = v[Number(k)];
    return out;
  };
  const lines = [
    shiftedHeaders.map(csvCell).join(','),
    ...SEIS_GOALS_ROWS.map((r) => seisCsvLine(shift(r), shiftedHeaders)),
  ];
  return lines.join('\r\n');
}

export const SEIS_GOALS_SHIFTED_CSV = (): Buffer =>
  Buffer.from(buildSeisGoalsShiftedCsv(), 'utf-8');

// ---------------------------------------------------------------------------
// Windows-1252-encoded generic CSV (accented names -> mojibake under UTF-8)
// ---------------------------------------------------------------------------

/**
 * A generic-format CSV whose accented names are encoded as Windows-1252.
 * For these code points (ñ = 0xF1, é = 0xE9, í = 0xED, á = 0xE1) Windows-1252
 * and latin1 are byte-identical, so latin1 serialization yields the correct
 * bytes. parseCSVReport decodes UTF-8 first, turning 0xF1 into U+FFFD — this
 * fixture pins that current mojibake behavior (SPE-240 will add encoding
 * detection).
 *
 * A leading ID column keeps First/Last Name off index 0, where the current
 * generic detector's `!columnMapping.firstName` falsy-index check would reject
 * the whole file (pinned separately in generic-csv.test.ts).
 */
export const WINDOWS_1252_CSV = (): Buffer => {
  const text = [
    'Student ID,First Name,Last Name,Grade,Goal',
    '3100001,Sofía,Muñoz,2,"The student will read 50 words per minute with 90% accuracy."',
    '3100002,José,Peña,4,"The student will write a five-sentence paragraph with 80% accuracy."',
    '3100003,Renée,Ibáñez,K,"The student will identify rhyming words in 4 of 5 trials."',
  ].join('\r\n');
  return Buffer.from(text, 'latin1');
};

// ---------------------------------------------------------------------------
// SEIS Student Goals Report — XLSX variants
// ---------------------------------------------------------------------------

/** A subset of the SEIS goals rows used for the XLSX variants (kept small). */
const SEIS_XLSX_ROWS: SparseRow[] = SEIS_GOALS_ROWS.slice(0, 7);

function sparseToArray(values: SparseRow, width = SEIS_HEADERS.length): string[] {
  return Array.from({ length: width }, (_, i) => values[i] ?? '');
}

async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/**
 * XLSX variant with the header on row 1 and seven data rows (rows 2–8). Pins
 * the SPE-240 fixes: all seven rows import (parseSEISReport starts data on the
 * row after the detected header, not a fixed `rowNumber <= 5`), and each yields
 * exactly one goal (goal detection prefers the exact "Goal" column instead of
 * treating every "Goal"/"Objective" header as a goal column).
 */
export async function buildSeisXlsxHeaderRow1(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Student Goals');
  sheet.addRow(SEIS_HEADERS);
  for (const row of SEIS_XLSX_ROWS) {
    sheet.addRow(sparseToArray(row));
  }
  return workbookToBuffer(workbook);
}

/**
 * XLSX variant with ~5 metadata/title rows above the header. Header detection
 * only scans the first 5 rows, so a header pushed to row 6 is never found and
 * the sheet yields a "could not detect columns" error — pinning how title rows
 * defeat the current fixed 5-row detection window.
 */
export async function buildSeisXlsxMetadataRows(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Student Goals');
  sheet.addRow(['SEIS Student Goals Report']);
  sheet.addRow(['District: Example Unified']);
  sheet.addRow(['Generated: 07/01/2026']);
  sheet.addRow(['Confidential — Fictional Test Data']);
  sheet.addRow([]); // blank spacer row
  sheet.addRow(SEIS_HEADERS); // header now on row 6, outside the scan window
  for (const row of SEIS_XLSX_ROWS) {
    sheet.addRow(sparseToArray(row));
  }
  return workbookToBuffer(workbook);
}

/**
 * XLSX variant with two title rows, the header on row 3, then data. Proves the
 * row-skip fix generalizes beyond a row-1 header: detection finds the header
 * within the 5-row window and data starts on the row AFTER it (row 4+), rather
 * than at a fixed offset. The title rows carry no name/grade text, so they
 * don't perturb header detection.
 */
export async function buildSeisXlsxTitleThenHeader(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Student Goals');
  sheet.addRow(['SEIS Student Goals Report']); // row 1 title
  sheet.addRow(['District: Example Unified']); // row 2 title
  sheet.addRow(SEIS_HEADERS); // header on row 3
  for (const row of SEIS_XLSX_ROWS.slice(0, 3)) {
    sheet.addRow(sparseToArray(row)); // Alvarez, Bishop, Cho on rows 4-6
  }
  return workbookToBuffer(workbook);
}
