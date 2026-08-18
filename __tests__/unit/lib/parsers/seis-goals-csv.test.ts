/**
 * Golden-fixture tests for the SEIS Student Goals Report CSV path (SPE-239),
 * i.e. parseCSVReport with the fixed-column SEIS layout.
 *
 * Pins: BOM handling (SPE-241, already landed), the full parsed result over a
 * 59-column fictional fixture, duplicate-student goal merging, header-name
 * (not fixed-position) column resolution across both real export shapes —
 * per-provider and district-wide, which differ by an inserted SSID column
 * (SPE-558) — and per-role goal filtering including word-boundary routing
 * ("Handwriting" -> OT not resource, "Social/Emotional" -> counseling not OT),
 * blank-metadata rows surfaced for review, and typo losses
 * ("Receptive Languge" -> not speech). See SPE-247.
 */

import { parse } from 'csv-parse/sync';
import { detectSEISStudentGoalsFormat, parseCSVReport } from '@/lib/parsers/csv-parser';

/** Header+rows view of a fixture, for asserting which detection path it takes. */
const toRecords = (csv: Buffer): string[][] =>
  parse(csv, { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true });
import {
  buildSeisGoalsCsvFrom,
  buildSeisGoalsCsvWithHeaders,
  buildSeisGoalsCsvWithoutColumns,
  SEIS_GOALS_CSV,
  SEIS_GOALS_CSV_BOM,
  SEIS_GOALS_DISTRICT_CSV,
  SEIS_GOALS_SHIFTED_CSV,
} from './fixtures/builders';

describe('parseCSVReport — SEIS Student Goals Report (CSV)', () => {
  it('parses the full fixture (no role filter) into the golden snapshot', async () => {
    const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), {});
    expect(result.metadata.formatDetected).toBe('seis-student-goals');
    expect(result.errors).toHaveLength(0);
    expect(result).toMatchSnapshot();
  });

  it('produces identical students with and without the UTF-8 BOM', async () => {
    const withBom = await parseCSVReport(SEIS_GOALS_CSV_BOM(), {});
    const withoutBom = await parseCSVReport(SEIS_GOALS_CSV(), {});
    expect(withBom.students).toEqual(withoutBom.students);
  });

  it('merges a duplicate student\'s second goal into the first record', async () => {
    const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), {});
    const ana = result.students.filter((s) => s.initials === 'AA' && s.lastName === 'Alvarez');
    expect(ana).toHaveLength(1);
    expect(ana[0].goals).toHaveLength(2); // reading goal + merged written-narrative goal
  });

  // SPE-558: detection and mapping are by header NAME, so moving every column
  // one to the right changes nothing. Before the fix this scored 0 of 6 against
  // the fixed indexes and silently fell through to the generic parser.
  it('parses a column-shifted export identically to the canonical one', async () => {
    const shifted = await parseCSVReport(SEIS_GOALS_SHIFTED_CSV(), {});
    const canonical = await parseCSVReport(SEIS_GOALS_CSV(), {});

    expect(shifted.metadata.formatDetected).toBe('seis-student-goals');
    expect(shifted.errors).toHaveLength(0);
    expect(shifted.students).toEqual(canonical.students);
  });

  // SPE-339: column B is the district's own Student ID. Column A is the SEIS ID,
  // which is a different number — a parser reading the wrong column would still
  // "work", so these assert the actual values.
  it('captures the District ID from column B, not the SEIS ID from column A', async () => {
    const result = await parseCSVReport(SEIS_GOALS_CSV(), {});
    const byName = new Map(result.students.map((s) => [`${s.firstName} ${s.lastName}`, s]));

    expect(byName.get('Ana Alvarez')!.districtStudentId).toBe('100001');
    expect(byName.get('Ben Bishop')!.districtStudentId).toBe('100002');
    // Not the SEIS IDs (2000001 / 2000002).
    expect(byName.get('Ana Alvarez')!.districtStudentId).not.toBe('2000001');
  });

  it('leaves the id undefined when column B is blank', async () => {
    const result = await parseCSVReport(SEIS_GOALS_CSV(), {});
    const gia = result.students.find((s) => s.lastName === 'Gomez');
    expect(gia).toBeDefined();
    expect(gia!.districtStudentId).toBeUndefined();
  });

  it('warns instead of silently dropping a conflicting id across a student\'s goal rows', async () => {
    // Two goal rows for one student carrying DIFFERENT ids means the export is
    // inconsistent, or two real children are being merged by name+grade+school.
    // Either way it must not vanish.
    const rows = [
      { 0: '2000001', 1: '100001', 2: 'Alvarez', 3: 'Ana', 5: '01', 6: 'Mt Diablo Elementary School',
        9: '05/01/2026', 11: 'Reading', 12: 'Academic #1',
        14: 'By 5/1/2027, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
        17: 'Resource Specialist' },
      { 0: '2000001', 1: '999999', 2: 'Alvarez', 3: 'Ana', 5: '01', 6: 'Mt Diablo Elementary School',
        9: '05/01/2026', 11: 'Written', 12: 'Academic #2',
        14: 'By 5/1/2027, Ana will write a personal narrative with a beginning, middle, and end.',
        17: 'Resource Specialist' },
    ];
    const result = await parseCSVReport(buildSeisGoalsCsvFrom(rows), {});

    // First id wins, and the clash is reported.
    expect(result.students[0].districtStudentId).toBe('100001');
    expect(result.warnings.some((w) => /Student ID mismatch/.test(w.message))).toBe(true);
  });

  // SPE-558. SEIS's district-wide export of this same report inserts an `SSID`
  // column at index 1, shifting District ID and everything after it one right.
  // That shape imported silently wrong: no district id (the only key the
  // OneRoster link sync matches on), no school, no IEP date, and progress
  // labels mixed into the goals — with zero errors raised.
  describe('district-wide export shape (extra SSID column)', () => {
    it('is still recognized as the SEIS Student Goals Report', async () => {
      const result = await parseCSVReport(SEIS_GOALS_DISTRICT_CSV(), {});
      expect(result.metadata.formatDetected).toBe('seis-student-goals');
      expect(result.errors).toHaveLength(0);
    });

    it('yields the same students as the per-provider export', async () => {
      const district = await parseCSVReport(SEIS_GOALS_DISTRICT_CSV(), {});
      const provider = await parseCSVReport(SEIS_GOALS_CSV(), {});
      expect(district.students).toEqual(provider.students);
    });

    it('captures the District ID — not the SSID beside it, nor the SEIS ID', async () => {
      const result = await parseCSVReport(SEIS_GOALS_DISTRICT_CSV(), {});
      const ana = result.students.find((s) => s.lastName === 'Alvarez')!;

      expect(ana.districtStudentId).toBe('100001');
      expect(ana.districtStudentId).not.toBe('98100001'); // the SSID
      expect(ana.districtStudentId).not.toBe('2000001'); // the SEIS ID
    });

    it('still fills school of attendance and IEP date', async () => {
      const result = await parseCSVReport(SEIS_GOALS_DISTRICT_CSV(), {});
      const ana = result.students.find((s) => s.lastName === 'Alvarez')!;

      expect(ana.schoolOfAttendance).toBe('Mt Diablo Elementary School');
      expect(ana.iepDate).toBe('2026-05-01');
    });
  });

  // The other half of SPE-558: the generic fallback's fuzzy /goal|objective/
  // sweep pulled every header containing "goal" into the goal list. On the real
  // export that meant "Limited Progress", "ST #1 2026-2027" and prior-year
  // objectives landing in a child's IEP goals. Only the exact `Goal` column is
  // goal text — the same rule seis-parser.ts (XLSX) already applies.
  it('takes goal text only from the exact "Goal" column, never its lookalikes', async () => {
    const goalText =
      'By 5/1/2027, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials.';
    const result = await parseCSVReport(
      buildSeisGoalsCsvFrom([
        {
          0: '2000001', 1: '100001', 2: 'Alvarez', 3: 'Ana', 5: '01',
          6: 'Mt Diablo Elementary School', 9: '05/01/2026', 11: 'Reading',
          12: 'Academic #1', 13: 'Ana currently reads 40 words per minute.', // Baseline
          14: goalText, // Goal — the only real one
          15: 'Addresses other educational needs', // Purpose(s) of Goal
          17: 'Resource Specialist',
          18: 'Objective 1: Ana will read 60 words per minute by December.', // Objective 1
          39: 'Limited Progress', // Goal Met
          45: 'Progressing toward goal', // Comparison To Goal
          47: 'Reading Standard 3.2', // Grade Level Standard
        },
      ]),
      {},
    );

    expect(result.students).toHaveLength(1);
    expect(result.students[0].goals).toEqual([goalText]);
    // And the decoy in a "Grade"-containing header didn't become the grade.
    expect(result.students[0].gradeLevel).toBe('1');
  });

  // SPE-558 review. Detection tolerates one missing signature header (5 of 6),
  // so the mapping has to tolerate the same variance — an exact-only lookup
  // turns "recognized but labelled slightly differently" into a silent dropped
  // field or a hard failure, both worse than the fixed-index code they replaced.
  describe('variant header labels (5-of-6 detection still applies)', () => {
    it('finds the school column when it is labelled just "School"', async () => {
      const csv = buildSeisGoalsCsvWithHeaders({ 6: 'School' });

      // Behavioral proof: school scoping still refuses an out-of-district
      // student. An unresolved school column short-circuits that guard and
      // imports them with no warning at all.
      const result = await parseCSVReport(csv, { userSchools: ['Some Other School'] });

      expect(result.students).toHaveLength(0);
      expect(result.warnings.some((w) => /doesn't match your school/i.test(w.message))).toBe(true);
    });

    it('keeps the school on the parsed student when labelled just "School"', async () => {
      const result = await parseCSVReport(buildSeisGoalsCsvWithHeaders({ 6: 'School' }), {});
      const ana = result.students.find((s) => s.lastName === 'Alvarez')!;
      expect(ana.schoolOfAttendance).toBe('Mt Diablo Elementary School');
    });

    // The lookalike columns are POPULATED here on purpose. An earlier round of
    // this fix passed the same test with them blank, which proved nothing: the
    // fuzzy fallback it was guarding only misfires when they carry text.
    it('finds the goal column when it is labelled "IEP Goal", without dragging in its lookalikes', async () => {
      const goalText =
        'By 5/1/2027, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials.';
      const csv = buildSeisGoalsCsvWithHeaders({ 14: 'IEP Goal' }, [
        {
          0: '2000001', 1: '100001', 2: 'Alvarez', 3: 'Ana', 5: '01',
          6: 'Mt Diablo Elementary School', 9: '05/01/2026', 11: 'Reading',
          12: 'Academic #1', 13: 'Ana currently reads 40 words per minute.',
          14: goalText,
          15: 'Addresses other educational needs', // Purpose(s) of Goal
          17: 'Resource Specialist',
          18: 'Objective 1: Ana will read 60 words per minute by December.',
          39: 'Limited Progress toward goal', // Goal Met
          45: 'Progressing toward goal', // Comparison To Goal
        },
      ]);
      expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(true);

      const result = await parseCSVReport(csv, {});

      expect(result.errors).toHaveLength(0);
      expect(result.students).toHaveLength(1);
      expect(result.students[0].goals).toEqual([goalText]);
    });

    // One relabel at a time, deliberately: renaming two signature headers drops
    // detection to 4 of 6, and the file would reach the generic path — which
    // handles these variants anyway, so such a test would pass without ever
    // exercising the SEIS mapper it is meant to guard.
    it('finds the first-name column when labelled "Student First Name"', async () => {
      const csv = buildSeisGoalsCsvWithHeaders({ 3: 'Student First Name' });
      expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(true); // still the SEIS path

      const result = await parseCSVReport(csv, {});

      expect(result.errors).toHaveLength(0);
      expect(result.students.find((s) => s.lastName === 'Alvarez')!.firstName).toBe('Ana');
    });

    it('finds the grade column when labelled "Current Grade"', async () => {
      const csv = buildSeisGoalsCsvWithHeaders({ 5: 'Current Grade' });
      expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(true); // still the SEIS path

      const result = await parseCSVReport(csv, {});

      expect(result.errors).toHaveLength(0);
      expect(result.students.find((s) => s.lastName === 'Alvarez')!.gradeLevel).toBe('1');
    });
  });

  // SPE-558 review round 2. The six signature fields are all common labels, so
  // name-anywhere matching alone also describes an ordinary spreadsheet. Handing
  // one of those to the SEIS path would subject it to per-role goal filtering
  // and import zero students — worse than the fixed-index code, which such a
  // file could never satisfy. SEIS-only marker columns are what keep them apart.
  describe('does not claim ordinary spreadsheets', () => {
    const GENERIC_CSV = Buffer.from(
      [
        'Last Name,First Name,Grade,School of Attendance,Goal',
        'Alvarez,Ana,1,Mt Diablo Elementary School,' +
          '"By 5/1/2027, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials."',
      ].join('\r\n'),
      'utf-8',
    );

    it('leaves a plain Last/First/Grade/School/Goal file on the generic path', async () => {
      expect(detectSEISStudentGoalsFormat(toRecords(GENERIC_CSV))).toBe(false);

      const result = await parseCSVReport(GENERIC_CSV, {});
      expect(result.metadata.formatDetected).toBe('generic');
    });

    it('still imports that file for a keyworded role, rather than filtering it to nothing', async () => {
      // The real damage of a false SEIS positive: role filtering needs Area of
      // Need / Annual Goal # / Person Responsible, and a generic file has none,
      // so every goal would be dropped.
      const result = await parseCSVReport(GENERIC_CSV, { providerRole: 'resource' });

      expect(result.students).toHaveLength(1);
      expect(result.students[0].goals).toHaveLength(1);
    });

    it('leaves a hand-built goals sheet generic even with Case Manager and IEP Date', async () => {
      // The near-miss: ordinary special-ed vocabulary is not evidence of a SEIS
      // export. Routing this to the SEIS path role-filters it to zero students,
      // which reaches the user as a 400 naming a report they never uploaded.
      const csv = Buffer.from(
        [
          'Last Name,First Name,Grade,School of Attendance,Case Manager,IEP Date,District ID,Area Of Need,Baseline,Goal',
          'Alvarez,Ana,1,Mt Diablo Elementary School,R. Diaz,05/01/2026,100001,Reading,Reads 40 wpm,' +
            '"By 5/1/2027, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials."',
        ].join('\r\n'),
        'utf-8',
      );
      expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(false);

      const result = await parseCSVReport(csv, { providerRole: 'resource' });
      expect(result.students).toHaveLength(1);
    });

    it('does not let a bare "Goal Type" column stand in for SEIS\'s "Annual Goal #"', async () => {
      // The 6-of-6 waiver skips the marker requirement, so it must rest on the
      // label that is actually SEIS's. "Goal Type" satisfies the same field but
      // is ordinary spreadsheet vocabulary.
      const csv = Buffer.from(
        [
          'Last Name,First Name,Grade,School of Attendance,Goal,Goal Type',
          'Alvarez,Ana,1,Mt Diablo Elementary School,' +
            '"By 5/1/2027, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials.",Academic',
        ].join('\r\n'),
        'utf-8',
      );
      expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(false);

      const result = await parseCSVReport(csv, { providerRole: 'resource' });
      expect(result.students).toHaveLength(1);
    });

    // SEIS decorates labels with parentheticals; the positional code tolerated
    // any suffix for free by never reading the label. Without this a decorated
    // REQUIRED column turns a file that used to import into a hard failure.
    it.each([
      ['grade', 5, 'Grade (as of 10/01)'],
      ['last name', 2, 'Last Name (Legal)'],
      ['first name', 3, 'First Name (Legal)'],
      ['school', 6, 'School of Attendance (Current)'],
      ['goal', 14, 'Goal (2026-2027)'],
    ])('accepts a parenthetical suffix on the %s column', async (_field, index, header) => {
      const csv = buildSeisGoalsCsvWithHeaders({ [index]: header });
      expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(true);

      const result = await parseCSVReport(csv, {});
      const ana = result.students.find((s) => s.lastName === 'Alvarez');

      expect(result.errors).toHaveLength(0);
      expect(ana).toBeDefined();
      expect(ana!.gradeLevel).toBe('1');
      expect(ana!.schoolOfAttendance).toBe('Mt Diablo Elementary School');
      expect(ana!.goals.length).toBeGreaterThan(0);
    });

    it('finds the school column when it is labelled "Current School Name"', async () => {
      // seis-parser.ts (XLSX) accepts this label; the two paths read the same
      // report and shouldn't disagree about which column is the school.
      const csv = buildSeisGoalsCsvWithHeaders({ 6: 'Current School Name' });

      const result = await parseCSVReport(csv, { userSchools: ['Some Other School'] });

      expect(result.students).toHaveLength(0);
      expect(result.warnings.some((w) => /doesn't match your school/i.test(w.message))).toBe(true);
    });

    it('reads the goal column from its position when the label is unrecognizable', async () => {
      // Labels are an unbounded space, so an unrecognizable one falls back to
      // the canonical position rather than failing the file or handing it to
      // the generic path (which would lose district id / school / IEP date).
      const csv = buildSeisGoalsCsvWithHeaders({ 14: 'Goal Description' });
      expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(true);

      const result = await parseCSVReport(csv, {});
      const ana = result.students.find((s) => s.lastName === 'Alvarez')!;

      expect(result.errors).toHaveLength(0);
      expect(ana.goals[0]).toMatch(/grade-level passage/);
      expect(ana.districtStudentId).toBe('100001');
      expect(ana.schoolOfAttendance).toBe('Mt Diablo Elementary School');
    });

    it('reads grade from its position, never from "Grade Level Standard"', async () => {
      // A bare /grade/ scan binds to the standards column (index 47, "Reading
      // Standard 3.2") and imports every student as grade "3".
      const csv = buildSeisGoalsCsvWithHeaders({ 5: 'Year Of Study' });

      const result = await parseCSVReport(csv, {});
      const ana = result.students.find((s) => s.lastName === 'Alvarez')!;

      expect(ana.gradeLevel).toBe('1');
    });
  });

  // SPE-558. A column this parser can proceed without still costs the user
  // something invisible — silence is the exact complaint that opened this
  // ticket. These use columns REMOVED from the export, not relabelled: a
  // relabelled column is recovered from its canonical position, so only a
  // genuinely absent one reaches these warnings.
  describe('says so when an optional-but-costly column is missing', () => {
    it('warns that teachers cannot be matched when there is no District ID column', async () => {
      const result = await parseCSVReport(buildSeisGoalsCsvWithoutColumns([1]), {});

      expect(result.students.length).toBeGreaterThan(0);
      expect(result.students.every((s) => s.districtStudentId === undefined)).toBe(true);
      expect(result.warnings.some((w) => /district student id/i.test(w.message))).toBe(true);
    });

    it('warns when no goal-routing column exists and a keyworded role would import nothing', async () => {
      const result = await parseCSVReport(buildSeisGoalsCsvWithoutColumns([11, 12, 17]), {
        providerRole: 'resource',
      });

      expect(result.students).toHaveLength(0);
      expect(result.warnings.some((w) => /route each goal/i.test(w.message))).toBe(true);
    });

    it('warns that scoping and dedup are weakened when there is no school column', async () => {
      // Both guards behind this column fail OPEN, so silence here means a
      // provider imports other schools' students and can merge two children.
      const csv = buildSeisGoalsCsvWithoutColumns([6]);
      expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(true);

      const result = await parseCSVReport(csv, { userSchools: ['Mt Diablo Elementary School'] });

      expect(result.students.every((s) => s.schoolOfAttendance === undefined)).toBe(true);
      expect(result.warnings.some((w) => /school of attendance/i.test(w.message))).toBe(true);
    });

    it('says it once, not once per row, when the routing columns are absent', async () => {
      // Every row trivially lacks a routing signal, so the per-row warning would
      // fire for all of them and bury the one message that explains why — and
      // the zero-student path returns warnings uncapped.
      const result = await parseCSVReport(buildSeisGoalsCsvWithoutColumns([11, 12, 17]), {
        providerRole: 'resource',
      });

      expect(result.warnings.filter((w) => /route each goal/i.test(w.message))).toHaveLength(1);
      expect(result.warnings.filter((w) => w.row > 0)).toHaveLength(0);
    });

    // Grade resolves to the leftmost accepted label, so neither spelling can be
    // beaten by a stray copy of the other further right. Name priority failed
    // one of these two directions whichever order it was listed in.
    it.each([
      ['student grade under "Grade Level", stray "Grade" at the far right', 'Grade Level', 'Grade'],
      ['student grade under "Grade", stray "Grade Level" at the far right', 'Grade', 'Grade Level'],
    ])('binds grade to the real column — %s', async (_label, realHeader, strayHeader) => {
      const csv = buildSeisGoalsCsvWithHeaders({ 5: realHeader, 47: strayHeader });

      const result = await parseCSVReport(csv, {});
      const ana = result.students.find((s) => s.lastName === 'Alvarez');

      expect(ana).toBeDefined();
      expect(ana!.gradeLevel).toBe('1');
    });

    it('stays quiet when those columns are present', async () => {
      const result = await parseCSVReport(SEIS_GOALS_CSV(), { providerRole: 'resource' });
      expect(result.warnings.some((w) => /district student id|route each goal/i.test(w.message))).toBe(
        false,
      );
    });
  });

  // Header labels alone cannot separate a column-trimmed SEIS export from an
  // ordinary goals spreadsheet — they can be identical — so the marker columns
  // are required with no full-house waiver. This file goes to the generic path,
  // which is exactly where the old fixed-index detector sent it.
  it('leaves a marker-less SEIS-shaped file on the generic path, as before', async () => {
    const csv = Buffer.from(
      [
        'District ID,Last Name,First Name,Grade,School of Attendance,IEP Date,Area Of Need,Annual Goal #,Goal,Person Responsible',
        '100001,Alvarez,Ana,01,Mt Diablo Elementary School,05/01/2026,Reading,Academic #1,' +
          '"By 5/1/2027, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials.",' +
          'Resource Specialist',
      ].join('\r\n'),
      'utf-8',
    );

    expect(detectSEISStudentGoalsFormat(toRecords(csv))).toBe(false);

    const result = await parseCSVReport(csv, { providerRole: 'resource' });
    expect(result.students).toHaveLength(1);

    // Pinning the KNOWN COST of that path, not endorsing it (SPE-564): the
    // generic mapper has no district id / school / IEP date, and its unanchored
    // goal sweep takes "Annual Goal #" as goal text. Identical on main — a
    // marker-less file has always landed here — so this documents the gap
    // rather than a regression. Change these expectations when SPE-564 lands.
    const ana = result.students[0];
    expect(ana.districtStudentId).toBeUndefined();
    expect(ana.schoolOfAttendance).toBeUndefined();
    expect(ana.iepDate).toBeUndefined();
    expect(ana.goals).toContain('Academic #1');
  });

  describe('per-role goal filtering', () => {
    // Real-file reference counts (kept/total goals): resource 119/184, speech
    // 58, OT 12, counseling 9. This fictional fixture is far smaller; the
    // snapshot locks its own current counts.
    const roles = ['resource', 'speech', 'ot', 'counseling', 'psychologist'];

    it('snapshots kept-student and filtered-goal counts per role', async () => {
      const counts: Record<string, { students: number; goalsFiltered: number | undefined }> = {};
      for (const role of roles) {
        const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: role });
        counts[role] = {
          students: result.students.length,
          goalsFiltered: result.metadata.goalsFiltered,
        };
      }
      expect(counts).toMatchSnapshot();
    });

    it('routes the "Handwriting" goal to OT, not resource (word-boundary + OT keyword)', async () => {
      // Pre-fix: `writing` matched inside "Handwriting", so a resource import
      // swallowed Finn's OT handwriting goal and OT never saw it. Now it routes
      // to OT only. See SPE-247.
      const resource = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'resource' });
      expect(resource.students.some((s) => s.lastName === 'Foster')).toBe(false);

      const ot = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'ot' });
      expect(ot.students.some((s) => s.lastName === 'Foster')).toBe(true);
    });

    it('drops the "Receptive Languge" typo row for speech', async () => {
      const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'speech' });
      expect(result.students.some((s) => s.lastName === 'Hunt')).toBe(false);
    });

    it('surfaces the blank-metadata goal row for review instead of importing or dropping it silently', async () => {
      const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'resource' });
      // Still not imported under a guessed role (blank metadata = no signal)...
      expect(result.students.some((s) => s.lastName === 'Gomez')).toBe(false);
      // ...but surfaced as a review warning rather than vanishing entirely.
      expect(result.warnings.some((w) => /review/i.test(w.message))).toBe(true);
    });

    it('no longer matches the Social/Emotional student to OT (word-boundary kills "ot" in "emotional")', async () => {
      // Pre-fix the 2-letter OT keyword matched inside "emOTional", pulling Diaz
      // (a counseling student) into OT imports. Word boundaries stop that; Diaz
      // still routes to counseling.
      const ot = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'ot' });
      expect(ot.students.some((s) => s.lastName === 'Diaz')).toBe(false);

      const counseling = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'counseling' });
      expect(counseling.students.some((s) => s.lastName === 'Diaz')).toBe(true);
    });
  });
});
