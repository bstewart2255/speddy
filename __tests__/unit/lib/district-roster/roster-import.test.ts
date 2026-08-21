/**
 * SPE-447 · what the district roster import actually writes.
 *
 * Two properties carry the weight here, and neither is visible in the planner:
 *
 *  1. A blank never reaches the database as a null. The planner decides a
 *     missing value is "no change"; this layer has to leave the column out of
 *     the UPDATE entirely, or a district whose IEP Dates export omits a
 *     student would wipe the review date a provider typed in by hand.
 *  2. Nothing is ever deleted. A child the files did not mention is reported,
 *     not removed.
 *
 * All data is fictional.
 */

const auditCalls: Array<Record<string, unknown>> = [];
jest.mock('@/lib/supabase/audit-log-server', () => ({
  logServerAuditEvent: (params: Record<string, unknown>) => {
    auditCalls.push(params);
    return Promise.resolve();
  },
}));

jest.mock('@/lib/logger', () => {
  const noop = () => {};
  const fake = { info: noop, warn: noop, error: noop, debug: noop, child: () => fake };
  return { logger: fake };
});

/** Every write the code attempted, in order. */
type Write =
  | { kind: 'insert'; table: string; rows: Record<string, unknown>[] }
  | { kind: 'update'; table: string; patch: Record<string, unknown>; id: unknown };
const writes: Write[] = [];
/** Set to fail the Nth write (1-based), to exercise the partial path. */
let failOnWrite: number | null = null;
let writeCount = 0;

/** Every read the loader issued: table plus the filters it applied, in order. */
interface Read {
  table: string;
  filters: [string, string, unknown][];
}
const reads: Read[] = [];
/** Rows each table's select resolves to, keyed by table. */
let rowsByTable: Record<string, Record<string, unknown>[]> = {};

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => {
        const read: Read = { table, filters: [] };
        reads.push(read);
        const q: Record<string, unknown> = {};
        const filter = (op: string) => (col: string, val: unknown) => {
          read.filters.push([op, col, val]);
          return q;
        };
        q.eq = filter('eq');
        q.is = filter('is');
        q.in = filter('in');
        // Keyset paging: the first page carries no `.gt()` at all, later pages
        // filter on the last id seen. The loader stops on a short page.
        let paged = false;
        q.gt = (col: string, val: unknown) => {
          read.filters.push(['gt', col, val]);
          paged = true;
          return q;
        };
        q.order = () => q;
        q.limit = () =>
          Promise.resolve({ data: paged ? [] : (rowsByTable[table] ?? []), error: null });
        return q;
      },
      insert: (rows: Record<string, unknown>[]) => {
        writes.push({ kind: 'insert', table, rows });
        writeCount++;
        return Promise.resolve(
          writeCount === failOnWrite ? { error: { message: 'boom' } } : { error: null },
        );
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => {
          writes.push({ kind: 'update', table, patch, id });
          writeCount++;
          return Promise.resolve(
            writeCount === failOnWrite ? { error: { message: 'boom' } } : { error: null },
          );
        },
      }),
    }),
  }),
}));

import {
  applyDistrictRosterPlan,
  loadDistrictRosterContext,
} from '@/lib/district-roster/roster-import';
import { planDistrictRoster, type RosterPlanInput } from '@/lib/district-roster/plan';

const DISTRICT_ID = '0618990';
const ACTOR = '55555555-5555-4555-8555-555555555555';

const SCHOOLS = [{ id: 'sch-rodeo', name: 'Rodeo Hills Elementary' }];

const plan = (over: Partial<RosterPlanInput> = {}) =>
  planDistrictRoster({
    districtId: DISTRICT_ID,
    today: '2026-08-19',
    schools: SCHOOLS,
    goalsStudents: [
      {
        firstName: 'Ana',
        lastName: 'Alvarez',
        initials: 'AA',
        gradeLevel: '1',
        districtStudentId: '100001',
        schoolOfAttendance: 'Rodeo Hills Elementary',
      },
    ],
    datesRecords: [],
    servicesStudents: [],
    accommodationsStudents: [],
    testingStudents: [],
    existingChildren: [],
    ...over,
  });

const apply = (over: Partial<RosterPlanInput> = {}) =>
  applyDistrictRosterPlan({ plan: plan(over), actorId: ACTOR, districtId: DISTRICT_ID });

beforeEach(() => {
  writes.length = 0;
  auditCalls.length = 0;
  reads.length = 0;
  rowsByTable = {};
  writeCount = 0;
  failOnWrite = null;
});

describe('loadDistrictRosterContext', () => {
  it('reads children by district, and by school ONLY where no district is set', async () => {
    rowsByTable = { schools: [{ id: 'sch-rodeo', name: 'Rodeo Hills Elementary' }] };
    await loadDistrictRosterContext(DISTRICT_ID);

    const childReads = reads.filter((r) => r.table === 'children');
    expect(childReads).toHaveLength(2);
    expect(childReads[0].filters).toEqual([['eq', 'district_id', DISTRICT_ID]]);
    // Some children legitimately sit at another district's school. Without the
    // null filter, this district's import could re-home one of them.
    expect(childReads[1].filters).toEqual([
      ['in', 'school_id', ['sch-rodeo']],
      ['is', 'district_id', null],
    ]);
  });

  it('counts the caseloads serving each child', async () => {
    rowsByTable = {
      schools: [{ id: 'sch-rodeo', name: 'Rodeo Hills Elementary' }],
      children: [
        { id: 'child-1', initials: 'AA', grade_level: '1', school_id: 'sch-rodeo' },
        { id: 'child-2', initials: 'BB', grade_level: '2', school_id: 'sch-rodeo' },
      ],
      students: [
        { id: 's1', child_id: 'child-1' },
        { id: 's2', child_id: 'child-1' },
      ],
    };
    const context = await loadDistrictRosterContext(DISTRICT_ID);

    expect(context.schools).toEqual([{ id: 'sch-rodeo', name: 'Rodeo Hills Elementary' }]);
    expect(
      context.existingChildren.map((c) => [c.id, c.caseloadCount]),
    ).toEqual([
      ['child-1', 2],
      ['child-2', 0],
    ]);
  });
});

describe('applyDistrictRosterPlan', () => {
  it('inserts a new child scoped to the importing district', async () => {
    const written = await apply();

    expect(written).toEqual({ created: 1, updated: 0 });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: 'insert', table: 'children' });
    expect((writes[0] as { rows: Record<string, unknown>[] }).rows[0]).toEqual({
      district_id: DISTRICT_ID,
      first_name: 'Ana',
      last_name: 'Alvarez',
      initials: 'AA',
      grade_level: '1',
      school_id: 'sch-rodeo',
      district_student_id: '100001',
      // Always present on INSERTS (empty when the files carry none): a bulk
      // insert NULL-fills any key another row has, and these columns are
      // NOT NULL. Updates still omit them, per the never-erase test below.
      accommodations: [],
      testing_accommodations: [],
    });
  });

  it('leaves a column out of the UPDATE when the files have no value for it', async () => {
    // The child has a review date a provider entered; neither file carries one.
    const written = await apply({
      existingChildren: [
        {
          id: 'child-1',
          districtStudentId: '100001',
          firstName: 'Ana',
          lastName: 'Alvarez',
          initials: 'AA',
          gradeLevel: '2',
          schoolId: 'sch-rodeo',
          upcomingIepDate: '2027-02-09',
          upcomingTriennialDate: null,
          caseloadCount: 1,
        },
      ],
    });

    expect(written).toEqual({ created: 0, updated: 1 });
    const patch = (writes[0] as { patch: Record<string, unknown> }).patch;
    expect(patch).toMatchObject({ grade_level: '1', district_id: DISTRICT_ID });
    // The columns the files said nothing about are simply not mentioned.
    expect(patch).not.toHaveProperty('upcoming_iep_date');
    expect(patch).not.toHaveProperty('upcoming_triennial_date');
    expect((writes[0] as { id: unknown }).id).toBe('child-1');
  });

  it('writes nothing at all for a child the roster did not mention', async () => {
    const built = plan({
      existingChildren: [
        {
          id: 'child-2',
          districtStudentId: '200002',
          firstName: 'Ben',
          lastName: 'Bishop',
          initials: 'BB',
          gradeLevel: '4',
          schoolId: 'sch-rodeo',
          upcomingIepDate: '2027-01-01',
          upcomingTriennialDate: null,
          caseloadCount: 2,
        },
      ],
    });
    expect(built.notInRoster).toHaveLength(1);

    await applyDistrictRosterPlan({ plan: built, actorId: ACTOR, districtId: DISTRICT_ID });

    // One insert for Ana; child-2 is never touched, in any form.
    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes)).not.toContain('child-2');
  });

  it('records a successful publish in the audit log, counts only', async () => {
    await apply();

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      user_id: ACTOR,
      action: 'district_roster_imported',
      resource_type: 'district',
      resource_id: DISTRICT_ID,
      metadata: expect.objectContaining({ partial: false, created: 1, updated: 0 }),
    });
    // No student names or initials anywhere in the audit metadata.
    expect(JSON.stringify(auditCalls[0].metadata)).not.toMatch(/Ana|Alvarez|AA/);
  });

  it('marks a partial write in the audit log and re-throws', async () => {
    failOnWrite = 1;

    await expect(apply()).rejects.toThrow(/Adding students to the roster failed/);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].metadata).toMatchObject({ partial: true, created: 0 });
  });

  it('gives every created row the same key set — a bulk insert NULL-fills gaps', async () => {
    // JSUSD's first real publish: 59 creates in one chunk, some students with
    // accommodations and some (new referrals) without. PostgREST unifies the
    // chunk's columns and fills the missing keys with NULL, which the NOT NULL
    // accommodations columns reject — 0 students written.
    await apply({
      goalsStudents: [
        {
          firstName: 'Ana',
          lastName: 'Alvarez',
          initials: 'AA',
          gradeLevel: '1',
          districtStudentId: '100001',
          schoolOfAttendance: 'Rodeo Hills Elementary',
        },
        {
          firstName: 'Ben',
          lastName: 'Bishop',
          initials: 'BB',
          gradeLevel: '2',
          districtStudentId: '100002',
          schoolOfAttendance: 'Rodeo Hills Elementary',
        },
      ],
      accommodationsStudents: [
        {
          firstName: 'Ana',
          lastName: 'Alvarez',
          gradeLevel: '1',
          schoolOfAttendance: 'Rodeo Hills Elementary',
          accommodations: ['Extended time'],
          testingAccommodations: [],
        },
      ],
    });

    const insert = writes.find((w) => w.kind === 'insert');
    expect(insert).toBeDefined();
    const rows = (insert as { rows: Record<string, unknown>[] }).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveProperty('accommodations');
      expect(row).toHaveProperty('testing_accommodations');
    }
    const ana = rows.find((r) => r.first_name === 'Ana');
    const ben = rows.find((r) => r.first_name === 'Ben');
    expect(ana?.accommodations).toEqual(['Extended time']);
    expect(ben?.accommodations).toEqual([]);
    expect(ben?.testing_accommodations).toEqual([]);
  });

  it('reports how far a failed publish got, so the admin is not told "maybe"', async () => {
    // First write (the insert chunk) succeeds, second (the update) fails.
    rowsByTable = {
      schools: [],
      children: [],
    };
    failOnWrite = 2;
    const input: Partial<RosterPlanInput> = {
      goalsStudents: [
        {
          firstName: 'Ana',
          lastName: 'Alvarez',
          initials: 'AA',
          gradeLevel: '1',
          districtStudentId: '100001',
          schoolOfAttendance: 'Rodeo Hills Elementary',
        },
        {
          firstName: 'Cara',
          lastName: 'Diaz',
          initials: 'CD',
          gradeLevel: '3',
          districtStudentId: '100003',
          schoolOfAttendance: 'Rodeo Hills Elementary',
        },
      ],
      existingChildren: [
        {
          id: 'child-cara',
          districtStudentId: '100003',
          firstName: 'Cara',
          lastName: 'Diaz',
          initials: 'CD',
          gradeLevel: '2',
          schoolId: 'sch-rodeo',
          dateOfBirth: null,
          upcomingIepDate: null,
          upcomingTriennialDate: null,
          caseManager: null,
          accommodations: [],
          testingAccommodations: [],
          districtServices: null,
          districtGoals: null,
          caseloadCount: 0,
        },
      ],
    };

    await expect(apply(input)).rejects.toMatchObject({
      name: 'RosterApplyError',
      progress: { created: 1, updated: 0 },
    });
    expect(auditCalls[0].metadata).toMatchObject({ partial: true, created: 1, updated: 0 });
  });

  it('refuses to apply a refused plan', async () => {
    const refused = plan({ goalsStudents: [], datesRecords: [] });
    expect(refused.refusal).not.toBeNull();

    await expect(
      applyDistrictRosterPlan({ plan: refused, actorId: ACTOR, districtId: DISTRICT_ID }),
    ).rejects.toThrow(/refused plan cannot be applied/);
    expect(writes).toHaveLength(0);
  });
});
