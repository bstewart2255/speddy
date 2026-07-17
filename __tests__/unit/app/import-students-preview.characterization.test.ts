/**
 * Characterization snapshot of the `/api/import-students` preview route across
 * ALL upload modes (SPE-230).
 *
 * Captured BEFORE the pipeline-module refactor and kept as the
 * behavior-preservation guard: the refactor that splits the ~1,100-line route
 * into lib/import/ modules and folds the deliveries/class-list-only branch into
 * the main pipeline MUST leave every snapshot here byte-identical. This is the
 * ticket's "fixture-diff the JSON preview responses before/after" acceptance,
 * automated.
 *
 * The real parsers run over the shared golden fixtures (builders.ts +
 * class-list.txt / deliveries.csv / roster-template.csv). Supabase is faked
 * per-table so the DB rows — and therefore the JSON — are fully deterministic.
 * All data is fictional.
 */

// Mock the server-only dependencies BEFORE importing the route.
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}));
jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/monitoring/analytics', () => ({
  track: { event: jest.fn(), pageView: jest.fn() },
}));
jest.mock('@/lib/monitoring/performance-alerts', () => ({
  measurePerformanceWithAlerts: () => ({ end: jest.fn() }),
}));

import { createClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/import-students/route';
import { SEIS_GOALS_CSV, buildSeisGoalsCsvFrom, readFixture } from '../lib/parsers/fixtures/builders';

const USER_ID = 'provider-1';

// Exact goal strings the SEIS fixture emits for Alvarez, Ana (reading + merged
// written-narrative). Stored in the DB student below so goals-only mode yields a
// genuine "skip" (no goal changes) for that student.
const ALVAREZ_GOALS = [
  'By 5/1/2027, given a grade-level passage, Ana will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
  'By 5/1/2027, Ana will write a personal narrative with a beginning, middle, and end in 4 of 5 samples.',
];

/** Flat students row shape the main path selects. */
const DB_STUDENTS_FLAT = [
  // Matches Alvarez, Ana: identical goals + no schedule/teacher on file → skip in
  // goals-only, update in all-three (enrichment adds schedule + teacher).
  {
    id: 'stu-alvarez', initials: 'AA', grade_level: '1',
    school_site: 'Mt Diablo Elementary', school_id: 'school-1',
    sessions_per_week: null, minutes_per_session: null, teacher_id: null,
  },
  // Matches Bishop, Ben: different stored goal → update (goal added + removed).
  {
    id: 'stu-bishop', initials: 'BB', grade_level: '2',
    school_site: 'St Mary', school_id: 'school-1',
    sessions_per_week: 1, minutes_per_session: 60, teacher_id: null,
  },
  // Matches a roster-template row (JD/3) with a differing schedule → update on
  // the roster path; irrelevant to the name-based SEIS path.
  {
    id: 'stu-jd', initials: 'JD', grade_level: '3',
    school_site: 'Mt Diablo Elementary', school_id: 'school-1',
    sessions_per_week: 1, minutes_per_session: 45, teacher_id: null,
  },
];

const DB_STUDENT_DETAILS = [
  { student_id: 'stu-alvarez', first_name: 'Ana', last_name: 'Alvarez', iep_goals: ALVAREZ_GOALS },
  { student_id: 'stu-bishop', first_name: 'Ben', last_name: 'Bishop', iep_goals: ['An old goal slated for removal.'] },
];

/** Joined students row shape the update-only path selects (student_details!inner). */
const DB_STUDENTS_JOINED = [
  { id: 'stu-alvarez', initials: 'AA', grade_level: '1', school_site: 'Mt Diablo Elementary', school_id: 'school-1', student_details: { first_name: 'Ana', last_name: 'Alvarez' } },
  { id: 'stu-ito', initials: 'IK', grade_level: '3', school_site: 'Mt Diablo Elementary', school_id: 'school-1', student_details: { first_name: 'Ken', last_name: 'Ito' } },
  { id: 'stu-vanhorn', initials: 'VV', grade_level: '4', school_site: 'Mt Diablo Elementary', school_id: 'school-1', student_details: { first_name: 'Vera', last_name: 'Van Horn' } },
];

const DB_TEACHERS = [
  { id: 't-barrera', first_name: 'Elena', last_name: 'Barrera' },
  { id: 't-batra', first_name: 'Raj', last_name: 'Batra' },
];

interface TableData {
  profiles?: { data: unknown; error: unknown };
  students?: { data: unknown; error: unknown };
  student_details?: { data: unknown; error: unknown };
  teachers?: { data: unknown; error: unknown };
}

/**
 * Minimal per-table Supabase fake. Every builder method chains (`select`/`eq`/
 * `in` return `this`); the terminal is either `.single()` (profiles) or an
 * awaited thenable (array selects), both resolving to the table's configured
 * `{ data, error }`.
 */
function makeSupabase(tables: TableData) {
  const builder = (table: string) => {
    const resp = (tables as Record<string, { data: unknown; error: unknown }>)[table] ?? { data: null, error: null };
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.single = async () => resp;
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(resp).then(resolve, reject);
    return b;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: (table: string) => builder(table),
  };
}

/**
 * A minimal File stand-in. The route only reads `.name`, `.type`, and
 * `.arrayBuffer()`, and this env's jsdom/undici `File` interop drops
 * `.arrayBuffer()` when a Node File is round-tripped — so build the shape
 * directly with a guaranteed byte-exact `arrayBuffer()`.
 */
interface FileLike {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function fileFrom(buf: Buffer, name: string, type: string): FileLike {
  return {
    name,
    type,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

function requestWith(
  files: Record<string, FileLike | undefined>,
  ctx?: { currentSchoolId?: string; currentSchoolSite?: string },
) {
  // Minimal FormData stand-in: the route only calls `formData.get(key)`. Using a
  // real (jsdom) FormData mangles the Node File into a value without
  // `.arrayBuffer()`, so return the File objects untouched via a `.get()` shim.
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(files)) {
    if (value) values[key] = value;
  }
  if (ctx?.currentSchoolId != null) values.currentSchoolId = ctx.currentSchoolId;
  if (ctx?.currentSchoolSite != null) values.currentSchoolSite = ctx.currentSchoolSite;
  const fd = { get: (key: string) => (key in values ? values[key] : null) };
  return {
    url: 'http://localhost/api/import-students',
    method: 'POST',
    formData: async () => fd,
  } as unknown as Request;
}

async function runPost(supabaseTables: TableData, request: Request): Promise<{ status: number; body: unknown }> {
  (createClient as jest.Mock).mockResolvedValue(makeSupabase(supabaseTables));
  const res = await POST(request as unknown as Parameters<typeof POST>[0]);
  const body = await res.json();
  return { status: res.status, body };
}

const studentsCsv = () => fileFrom(SEIS_GOALS_CSV(), 'students.csv', 'text/csv');
const deliveriesCsv = () => fileFrom(readFixture('deliveries.csv'), 'deliveries.csv', 'text/csv');
const classListTxt = () => fileFrom(readFixture('class-list.txt'), 'class-list.txt', 'text/plain');
const rosterCsv = () => fileFrom(readFixture('roster-template.csv'), 'roster.csv', 'text/csv');

const mainTables = (worksAtMultiple = false): TableData => ({
  profiles: { data: { works_at_multiple_schools: worksAtMultiple, role: 'resource' }, error: null },
  students: { data: DB_STUDENTS_FLAT, error: null },
  student_details: { data: DB_STUDENT_DETAILS, error: null },
  teachers: { data: DB_TEACHERS, error: null },
});

const updateOnlyTables = (): TableData => ({
  profiles: { data: { role: 'resource' }, error: null },
  students: { data: DB_STUDENTS_JOINED, error: null },
  teachers: { data: DB_TEACHERS, error: null },
});

const schoolCtx = { currentSchoolId: 'school-1', currentSchoolSite: 'Mt Diablo Elementary' };

describe('POST /api/import-students — preview characterization (SPE-230)', () => {
  it('goals-only: SEIS student goals file, no enrichment', async () => {
    const result = await runPost(mainTables(), requestWith({ studentsFile: studentsCsv() }, schoolCtx));
    expect(result.status).toBe(200);
    expect(result).toMatchSnapshot();
  });

  it('goals-only with multi-school filtering (works_at_multiple_schools)', async () => {
    const result = await runPost(mainTables(true), requestWith({ studentsFile: studentsCsv() }, schoolCtx));
    expect(result.status).toBe(200);
    expect(result).toMatchSnapshot();
  });

  it('all-three files: goals + deliveries + class list (full enrichment)', async () => {
    const result = await runPost(
      mainTables(),
      requestWith(
        { studentsFile: studentsCsv(), deliveriesFile: deliveriesCsv(), classListFile: classListTxt() },
        schoolCtx,
      ),
    );
    expect(result.status).toBe(200);
    expect(result).toMatchSnapshot();
  });

  it('deliveries-only: update-only mode (role-filtered deliveries matched to existing students)', async () => {
    const result = await runPost(updateOnlyTables(), requestWith({ deliveriesFile: deliveriesCsv() }, schoolCtx));
    expect(result.status).toBe(200);
    expect((result.body as { mode?: string }).mode).toBe('update');
    expect(result).toMatchSnapshot();
  });

  it('class-list-only: update-only mode with teacher matching', async () => {
    const result = await runPost(updateOnlyTables(), requestWith({ classListFile: classListTxt() }, schoolCtx));
    expect(result.status).toBe(200);
    expect((result.body as { mode?: string }).mode).toBe('update');
    expect(result).toMatchSnapshot();
  });

  it('roster-template: Speddy template CSV (initials + grade + inline teacher/schedule)', async () => {
    const result = await runPost(mainTables(), requestWith({ studentsFile: rosterCsv() }, schoolCtx));
    expect(result.status).toBe(200);
    expect(result).toMatchSnapshot();
  });

  it('students + deliveries (no class list)', async () => {
    const result = await runPost(
      mainTables(),
      requestWith({ studentsFile: studentsCsv(), deliveriesFile: deliveriesCsv() }, schoolCtx),
    );
    expect(result.status).toBe(200);
    expect(result).toMatchSnapshot();
  });

  it('students + class list (no deliveries)', async () => {
    const result = await runPost(
      mainTables(),
      requestWith({ studentsFile: studentsCsv(), classListFile: classListTxt() }, schoolCtx),
    );
    expect(result.status).toBe(200);
    expect(result).toMatchSnapshot();
  });

  it('deliveries + class list (no students): update-only, both enrichment files', async () => {
    const result = await runPost(
      updateOnlyTables(),
      requestWith({ deliveriesFile: deliveriesCsv(), classListFile: classListTxt() }, schoolCtx),
    );
    expect(result.status).toBe(200);
    expect((result.body as { mode?: string }).mode).toBe('update');
    expect(result).toMatchSnapshot();
  });

  it('no files: 400', async () => {
    const result = await runPost(mainTables(), requestWith({}));
    expect(result.status).toBe(400);
    expect(result).toMatchSnapshot();
  });
});

describe('POST /api/import-students — upload size guard (SPE-260)', () => {
  // The size is checked before the file is buffered, so arrayBuffer() is never called.
  const bigFile = (name = 'big.csv') =>
    ({ name, type: 'text/csv', size: 11 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as FileLike;

  it('rejects a file over the per-file cap with 413 (before parsing)', async () => {
    const result = await runPost(mainTables(), requestWith({ studentsFile: bigFile() }, schoolCtx));
    expect(result.status).toBe(413);
    expect((result.body as { error?: string }).error).toMatch(/exceeds the 10 MB limit/);
  });

  it('rejects an over-ceiling body by Content-Length before formData() is read', async () => {
    (createClient as jest.Mock).mockResolvedValue(makeSupabase(mainTables()));
    const req = {
      url: 'http://localhost/api/import-students',
      method: 'POST',
      headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? String(50 * 1024 * 1024) : null) },
      formData: async () => { throw new Error('formData must not be read when the body is too large'); },
    } as unknown as Request;
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(413);
  });
});

/**
 * SPE-264 regression: a multi-school provider's FIRST import into a school where
 * they have no students yet.
 *
 * Before the fix, the pipeline derived a parse-time school filter from the
 * schools where the provider ALREADY had students. When the selected school was
 * not among them (the first-import case), every student for that school was
 * dropped before the real (selected-school) filter ran, and the request failed
 * with a false "All N students belong to other schools" error. The scenario here
 * — existing students only at Bancroft, importing into Mt Diablo — reproduced it:
 * the Mt Diablo student was dropped at parse time, then the surviving Bancroft
 * student was scoped out, yielding the false 400. School scoping now happens in
 * exactly one place (applySchoolFilter), so the Mt Diablo student imports and
 * Bancroft is correctly scoped out.
 */
const DB_STUDENTS_BANCROFT_ONLY = [
  {
    id: 'stu-bancroft-1', initials: 'ZZ', grade_level: '5',
    school_site: 'Bancroft Elementary School', school_id: 'school-2',
    sessions_per_week: null, minutes_per_session: null, teacher_id: null,
  },
];

const bancroftProviderTables = (): TableData => ({
  profiles: { data: { works_at_multiple_schools: true, role: 'resource' }, error: null },
  students: { data: DB_STUDENTS_BANCROFT_ONLY, error: null },
  student_details: { data: [], error: null },
  teachers: { data: DB_TEACHERS, error: null },
});

// One student at the selected school (Mt Diablo), one at the provider's existing
// school (Bancroft) — both with a resource-matching Reading goal.
const firstImportCsv = () =>
  fileFrom(
    buildSeisGoalsCsvFrom([
      {
        0: '2000201', 2: 'Keller', 3: 'Kim', 5: '02', 6: 'Mt Diablo Elementary School',
        9: '05/01/2026', 11: 'Reading', 12: 'Academic #1: 2026 - 2027', 17: 'Resource Specialist',
        14: 'By 5/1/2027, given a grade-level passage, Kim will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
      },
      {
        0: '2000202', 2: 'Barnes', 3: 'Ben', 5: '03', 6: 'Bancroft Elementary School',
        9: '05/01/2026', 11: 'Reading', 12: 'Academic #1: 2026 - 2027', 17: 'Resource Specialist',
        14: 'By 5/1/2027, given a grade-level passage, Ben will read 100 words per minute with 95% accuracy in 3 of 4 trials.',
      },
    ]),
    'students.csv',
    'text/csv',
  );

describe('POST /api/import-students — multi-school first-import regression (SPE-264)', () => {
  it('imports selected-school students even when the provider has no existing students there', async () => {
    const result = await runPost(
      bancroftProviderTables(),
      requestWith({ studentsFile: firstImportCsv() }, schoolCtx),
    );

    // Must NOT be the false "all belong to other schools" 400.
    expect(result.status).toBe(200);

    const data = (result.body as {
      data?: {
        students?: Array<{ lastName?: string }>;
        summary?: { filteredOutSchools?: string[] };
      };
    }).data;

    const lastNames = (data?.students ?? []).map((s) => s.lastName);
    expect(lastNames).toContain('Keller'); // selected-school student imports
    expect(lastNames).not.toContain('Barnes'); // other-school student scoped out
    expect(data?.summary?.filteredOutSchools).toContain('Bancroft Elementary School');
  });

  it('does not merge same-name/same-grade students from different schools (no cross-school goal contamination)', async () => {
    // Two DIFFERENT students share first name, last name, and grade but attend
    // different schools. The selected-school (Mt Diablo) row appears first, so
    // before the dedup-key fix its record would absorb the Bancroft namesake's
    // goal (the parser merged by name+grade only, keeping the first row's
    // school). After the fix, school is part of the consolidation key, so the
    // two stay distinct and only the Mt Diablo student's own goal imports.
    const collidingCsv = () =>
      fileFrom(
        buildSeisGoalsCsvFrom([
          {
            0: '2000301', 2: 'Rivers', 3: 'Sam', 5: '04', 6: 'Mt Diablo Elementary School',
            9: '05/01/2026', 11: 'Reading', 12: 'Academic #1: 2026 - 2027', 17: 'Resource Specialist',
            14: 'By 5/1/2027, Sam at Mt Diablo will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
          },
          {
            0: '2000302', 2: 'Rivers', 3: 'Sam', 5: '04', 6: 'Bancroft Elementary School',
            9: '05/01/2026', 11: 'Reading', 12: 'Academic #1: 2026 - 2027', 17: 'Resource Specialist',
            14: 'By 5/1/2027, Sam at Bancroft will read 80 words per minute with 90% accuracy in 3 of 4 trials.',
          },
        ]),
        'students.csv',
        'text/csv',
      );

    const result = await runPost(bancroftProviderTables(), requestWith({ studentsFile: collidingCsv() }, schoolCtx));
    expect(result.status).toBe(200);

    const data = (result.body as {
      data?: { students?: Array<{ lastName?: string; goals?: Array<{ text?: string }> }> };
    }).data;

    const rivers = (data?.students ?? []).filter((s) => s.lastName === 'Rivers');
    // Exactly one Rivers imports (the Mt Diablo one); the Bancroft namesake is scoped out.
    expect(rivers).toHaveLength(1);
    const goalText = (rivers[0]?.goals ?? []).map((g) => g.text).join(' | ');
    expect(goalText).toContain('Mt Diablo'); // its own goal
    expect(goalText).not.toContain('Bancroft'); // NOT the other student's goal
  });

  it('errors with a clear "none are at your school" message (no misleading count) when the file has no selected-school students', async () => {
    // Every student in the file is at another school; with Mt Diablo selected,
    // all are scoped out. The message names the selected school and the schools
    // actually found, and no longer leads with a confusing count.
    const otherSchoolOnlyCsv = () =>
      fileFrom(
        buildSeisGoalsCsvFrom([
          {
            0: '2000401', 2: 'Torres', 3: 'Tina', 5: '02', 6: 'Bancroft Elementary School',
            9: '05/01/2026', 11: 'Reading', 12: 'Academic #1: 2026 - 2027', 17: 'Resource Specialist',
            14: 'By 5/1/2027, Tina will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
          },
        ]),
        'students.csv',
        'text/csv',
      );

    const result = await runPost(bancroftProviderTables(), requestWith({ studentsFile: otherSchoolOnlyCsv() }, schoolCtx));
    expect(result.status).toBe(400);
    const error = (result.body as { error?: string }).error ?? '';
    expect(error).toContain('None of the students in this file are at Mt Diablo Elementary');
    expect(error).toContain('Bancroft Elementary School');
    expect(error).not.toMatch(/All \d+ students/); // the misleading count is gone
  });
});

/**
 * SPE-269 — cross-school candidate scoping. Even with name-based matching
 * (SPE-266), a same-name student can exist at two schools, so match candidates
 * are scoped to the selected school. A Mt Diablo import must NOT match — and on
 * confirm update — a same-name/grade student stored at Bancroft.
 */
describe('POST /api/import-students — cross-school candidate scoping (SPE-269)', () => {
  it('does not match a same-name/grade student stored at a different school (scoped out → insert)', async () => {
    const dbAtOtherSchool = [
      {
        id: 'stu-other', initials: 'SR', grade_level: '3',
        school_site: 'Bancroft Elementary School', school_id: 'school-2',
        sessions_per_week: null, minutes_per_session: null, teacher_id: null,
      },
    ];
    const tables = (): TableData => ({
      profiles: { data: { works_at_multiple_schools: true, role: 'resource' }, error: null },
      students: { data: dbAtOtherSchool, error: null },
      student_details: {
        data: [{ student_id: 'stu-other', first_name: 'Sam', last_name: 'Rivers', iep_goals: ['An old Bancroft goal.'] }],
        error: null,
      },
      teachers: { data: DB_TEACHERS, error: null },
    });

    // Same student name + grade as the Bancroft record, but at the selected
    // school (Mt Diablo). Without scoping, name+grade would match cross-school.
    const csv = () =>
      fileFrom(
        buildSeisGoalsCsvFrom([
          {
            0: '2000501', 2: 'Rivers', 3: 'Sam', 5: '03', 6: 'Mt Diablo Elementary School',
            9: '05/01/2026', 11: 'Reading', 12: 'Academic #1: 2026 - 2027', 17: 'Resource Specialist',
            14: 'By 5/1/2027, Sam will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
          },
        ]),
        'students.csv',
        'text/csv',
      );

    const result = await runPost(tables(), requestWith({ studentsFile: csv() }, schoolCtx));
    expect(result.status).toBe(200);

    const data = (result.body as {
      data?: { students?: Array<{ lastName?: string; action?: string; goals?: Array<{ text?: string }> }> };
    }).data;
    const rivers = (data?.students ?? []).find((s) => s.lastName === 'Rivers');
    expect(rivers?.action).toBe('insert'); // NOT matched to the Bancroft Sam Rivers
    // And no cross-school goal contamination.
    expect((rivers?.goals ?? []).map((g) => g.text).join(' ')).not.toContain('Bancroft');
  });
});

/**
 * SPE-269 (Codex follow-up) — the deliveries/class-list-only update path scopes
 * to the selected school too. buildStudentsByName keys by normalized full name
 * and overwrites collisions, so without scoping a deliveries upload could match —
 * and update — a same-name student at a different school.
 */
describe('POST /api/import-students — cross-school update-only scoping (SPE-269)', () => {
  it("deliveries-only updates the selected school's student, not a same-name student elsewhere", async () => {
    // Same name ("Van Horn, Vera" — a weekly delivery, so it yields an update) at two
    // schools; the other-school row is listed LAST so an unscoped name map
    // (last-write-wins) would resolve the delivery to it.
    const joinedCrossSchool = [
      { id: 'stu-vanhorn-mtdiablo', initials: 'VV', grade_level: '4', school_site: 'Mt Diablo Elementary', school_id: 'school-1', student_details: { first_name: 'Vera', last_name: 'Van Horn' } },
      { id: 'stu-vanhorn-bancroft', initials: 'VV', grade_level: '4', school_site: 'Bancroft Elementary School', school_id: 'school-2', student_details: { first_name: 'Vera', last_name: 'Van Horn' } },
    ];
    const tables = (): TableData => ({
      profiles: { data: { role: 'resource' }, error: null },
      students: { data: joinedCrossSchool, error: null },
      teachers: { data: DB_TEACHERS, error: null },
    });

    const result = await runPost(tables(), requestWith({ deliveriesFile: deliveriesCsv() }, schoolCtx));
    expect(result.status).toBe(200);
    expect((result.body as { mode?: string }).mode).toBe('update');

    const data = (result.body as { data?: { students?: Array<{ studentId?: string }> } }).data;
    const ids = (data?.students ?? []).map((s) => s.studentId);
    expect(ids).toContain('stu-vanhorn-mtdiablo'); // selected school updated
    expect(ids).not.toContain('stu-vanhorn-bancroft'); // other-school same-name student not touched
  });
});

/**
 * SPE-269 (Codex follow-up) — a school with no school_id is submitted by the
 * modal as currentSchoolId '' (`school_id || ''`), while legacy student rows
 * carry school_id null. Those collapse to one bucket so a re-import of a legacy
 * null-school student is matched, not previewed as a spurious insert that then
 * dead-ends on confirm ("already exists").
 */
describe('POST /api/import-students — text-only school (null school_id) scoping (SPE-269)', () => {
  it('matches a legacy null-school student when the selected school submits currentSchoolId ""', async () => {
    const dbLegacy = [
      {
        id: 'stu-legacy', initials: 'SR', grade_level: '3',
        school_site: 'Mt Diablo Elementary', school_id: null,
        sessions_per_week: null, minutes_per_session: null, teacher_id: null,
      },
    ];
    const tables = (): TableData => ({
      profiles: { data: { works_at_multiple_schools: false, role: 'resource' }, error: null },
      students: { data: dbLegacy, error: null },
      student_details: {
        data: [{ student_id: 'stu-legacy', first_name: 'Sam', last_name: 'Rivers', iep_goals: ['An existing goal.'] }],
        error: null,
      },
      teachers: { data: DB_TEACHERS, error: null },
    });

    const csv = () =>
      fileFrom(
        buildSeisGoalsCsvFrom([
          {
            0: '2000501', 2: 'Rivers', 3: 'Sam', 5: '03', 6: 'Mt Diablo Elementary School',
            9: '05/01/2026', 11: 'Reading', 12: 'Academic #1: 2026 - 2027', 17: 'Resource Specialist',
            14: 'By 5/1/2027, Sam will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
          },
        ]),
        'students.csv',
        'text/csv',
      );

    // Text-only school: the modal submits currentSchoolId '' (school_id || '').
    const textOnlyCtx = { currentSchoolId: '', currentSchoolSite: 'Mt Diablo Elementary' };
    const result = await runPost(tables(), requestWith({ studentsFile: csv() }, textOnlyCtx));
    expect(result.status).toBe(200);

    const data = (result.body as {
      data?: { students?: Array<{ lastName?: string; action?: string }> };
    }).data;
    const rivers = (data?.students ?? []).find((s) => s.lastName === 'Rivers');
    // The legacy null-school row is in the candidate set → matched, not a spurious insert.
    expect(rivers?.action).not.toBe('insert');
  });
});
