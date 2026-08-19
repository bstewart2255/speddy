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

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
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

import { applyDistrictRosterPlan } from '@/lib/district-roster/roster-import';
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
    existingChildren: [],
    ...over,
  });

const apply = (over: Partial<RosterPlanInput> = {}) =>
  applyDistrictRosterPlan({ plan: plan(over), actorId: ACTOR, districtId: DISTRICT_ID });

beforeEach(() => {
  writes.length = 0;
  auditCalls.length = 0;
  writeCount = 0;
  failOnWrite = null;
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

  it('refuses to apply a refused plan', async () => {
    const refused = plan({ goalsStudents: [], datesRecords: [] });
    expect(refused.refusal).not.toBeNull();

    await expect(
      applyDistrictRosterPlan({ plan: refused, actorId: ACTOR, districtId: DISTRICT_ID }),
    ).rejects.toThrow(/refused plan cannot be applied/);
    expect(writes).toHaveLength(0);
  });
});
