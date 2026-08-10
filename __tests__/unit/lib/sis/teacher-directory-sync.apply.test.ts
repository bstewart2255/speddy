/**
 * SPE-437 · `applyTeacherSyncPlan` — what the writes actually carry, and what
 * is never written at all.
 *
 * The supabase stub records every query-builder call, so the assertions are
 * about the WRITE SHAPE: creates carry the SIS key and school placement,
 * adoption re-checks `sis_id IS NULL` in its WHERE, keyed updates filter on
 * the full key, refused schools see no writes, and counts come from what the
 * database says happened rather than what the plan hoped.
 */

const logCalls: unknown[][] = [];
jest.mock('@/lib/logger', () => {
  const record = (...args: unknown[]) => {
    logCalls.push(args);
  };
  const fake = { info: record, warn: record, error: record, debug: record, child: () => fake };
  return { logger: fake };
});

const mockAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/supabase/audit-log-server', () => ({
  logServerAuditEvent: (...args: unknown[]) => mockAudit(...(args as [])),
}));

/** One recorded builder chain: the table, the method calls, their arguments. */
interface RecordedQuery {
  table: string;
  calls: { method: string; args: unknown[] }[];
  result: { data: unknown; error: unknown };
}

const recorded: RecordedQuery[] = [];
/** Set per-test to control what a chain resolves to. */
let nextResult: (q: RecordedQuery) => { data: unknown; error: unknown };

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const record: RecordedQuery = { table, calls: [], result: { data: [], error: null } };
      recorded.push(record);
      const chain: Record<string, unknown> = {};
      for (const method of ['insert', 'update', 'select', 'eq', 'is', 'in']) {
        chain[method] = (...args: unknown[]) => {
          record.calls.push({ method, args });
          return chain;
        };
      }
      // Thenable, like the real builder: awaiting the chain resolves it.
      chain.then = (resolve: (v: unknown) => unknown) => {
        record.result = nextResult(record);
        return Promise.resolve(record.result).then(resolve);
      };
      return chain;
    },
  }),
}));

import {
  applyTeacherSyncPlan,
  type SchoolPlan,
  type TeacherSyncPlan,
} from '@/lib/sis/teacher-directory-sync';

const emptySchool: Omit<
  SchoolPlan,
  'schoolId' | 'schoolName' | 'sisSchoolName' | 'refusal'
> = {
  creates: [],
  adopts: [],
  updates: [],
  unchanged: 0,
  reviews: [],
  missingFromSis: [],
  excludedNonTeaching: 0,
  studentCount: 5,
};

const plan: TeacherSyncPlan = {
  schools: [
    {
      ...emptySchool,
      schoolId: 'sch-elem',
      schoolName: 'Rodeo Vista Elementary',
      sisSchoolName: 'Rodeo Vista Elementary School',
      refusal: null,
      creates: [
        {
          sisId: 'sid-1',
          firstName: 'CHARLI',
          lastName: 'OMALLEY',
          email: 'comalley@example.org',
          staffId: '11_TCH_1',
          gradeLevel: 'KG',
        },
      ],
      adopts: [
        { teacherId: 'row-adopt', sisId: 'sid-2', name: 'Hand Entered', email: 'he@example.org' },
      ],
      updates: [
        {
          teacherId: 'row-upd',
          sisId: 'sid-3',
          name: 'Keyed Row',
          changes: { email: 'new@example.org' },
        },
      ],
    },
    {
      ...emptySchool,
      schoolId: 'sch-refused',
      schoolName: 'Carquinez Stand-in Middle',
      sisSchoolName: 'Carquinez Stand-in Middle School',
      refusal: 'nothing here can be created accurately',
      // Even if a bug ever left rows on a refused school's plan, apply must
      // not write them; the planted create pins that.
      creates: [
        {
          sisId: 'sid-refused',
          firstName: 'NEVER',
          lastName: 'WRITTEN',
          email: 'nw@example.org',
          staffId: 'x',
          gradeLevel: null,
        },
      ],
    },
  ],
  unmappedSisSchools: [],
  shadowDuplicates: 0,
  duplicateEmailAnomalies: 0,
  feedTeacherRows: 3,
  feedTotalRows: 3,
};

const run = () =>
  applyTeacherSyncPlan({
    plan,
    actorId: 'staff-1',
    connectionId: 'conn-1',
    districtId: 'district-1',
  });

beforeEach(() => {
  recorded.length = 0;
  logCalls.length = 0;
  mockAudit.mockClear();
  // Default: every write succeeds and reports as many rows as were sent.
  nextResult = (q) => {
    const insert = q.calls.find((c) => c.method === 'insert');
    if (insert) {
      const rows = insert.args[0] as unknown[];
      return { data: rows.map((_, i) => ({ id: `new-${i}` })), error: null };
    }
    return { data: [{ id: 'touched' }], error: null };
  };
});

describe('applyTeacherSyncPlan', () => {
  it('writes creates with the SIS key, school placement, and verbatim names', async () => {
    const results = await run();

    const insert = recorded.find((q) => q.calls.some((c) => c.method === 'insert'));
    expect(insert).toBeDefined();
    const rows = insert!.calls.find((c) => c.method === 'insert')!.args[0] as Record<
      string,
      unknown
    >[];
    expect(rows).toEqual([
      {
        first_name: 'CHARLI',
        last_name: 'OMALLEY',
        email: 'comalley@example.org',
        school_id: 'sch-elem',
        school_site: 'Rodeo Vista Elementary',
        grade_level: 'KG',
        created_by_admin: false,
        sis_source: 'oneroster',
        sis_id: 'sid-1',
      },
    ]);
    expect(results).toEqual([
      { schoolId: 'sch-elem', schoolName: 'Rodeo Vista Elementary', created: 1, adopted: 1, updated: 1 },
    ]);
  });

  it('never writes anything for a refused school', async () => {
    await run();
    const serialized = JSON.stringify(recorded.map((q) => q.calls));
    expect(serialized).not.toContain('sid-refused');
    expect(serialized).not.toContain('NEVER');
  });

  it('adoption re-checks sis_id IS NULL, and reports an honest zero when the row moved on', async () => {
    nextResult = (q) => {
      const insert = q.calls.find((c) => c.method === 'insert');
      if (insert) {
        const rows = insert.args[0] as unknown[];
        return { data: rows.map((_, i) => ({ id: `new-${i}` })), error: null };
      }
      // The adoption UPDATE matches nothing (someone stamped the row first).
      const isNullGuard = q.calls.find((c) => c.method === 'is');
      if (isNullGuard) return { data: [], error: null };
      return { data: [{ id: 'touched' }], error: null };
    };

    const results = await run();

    const adoption = recorded.find((q) => q.calls.some((c) => c.method === 'is'));
    expect(adoption).toBeDefined();
    expect(adoption!.calls).toContainEqual({ method: 'is', args: ['sis_id', null] });
    expect(adoption!.calls).toContainEqual({
      method: 'update',
      args: [{ sis_source: 'oneroster', sis_id: 'sid-2' }],
    });
    expect(results[0].adopted).toBe(0);
  });

  it('keyed updates filter on the full SIS key, not just the row id', async () => {
    await run();
    const update = recorded.find((q) =>
      q.calls.some((c) => c.method === 'update' && 'email' in ((c.args[0] ?? {}) as object)),
    );
    expect(update).toBeDefined();
    expect(update!.calls).toContainEqual({ method: 'eq', args: ['sis_source', 'oneroster'] });
    expect(update!.calls).toContainEqual({ method: 'eq', args: ['sis_id', 'sid-3'] });
  });

  it('audits and logs COUNTS only — no names or emails anywhere', async () => {
    await run();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sis_teacher_sync_applied' }),
    );
    const everything = JSON.stringify([mockAudit.mock.calls, logCalls]);
    for (const value of ['CHARLI', 'OMALLEY', 'comalley@example.org', 'Hand Entered']) {
      expect(everything).not.toContain(value);
    }
  });

  it('a failed insert throws with the school named, and stops', async () => {
    nextResult = (q) => {
      const insert = q.calls.find((c) => c.method === 'insert');
      if (insert) return { data: null, error: { message: 'unique violation' } };
      return { data: [{ id: 'touched' }], error: null };
    };
    await expect(run()).rejects.toThrow(/Rodeo Vista Elementary failed: unique violation/);
    // Nothing was audited about a run that did not complete.
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
