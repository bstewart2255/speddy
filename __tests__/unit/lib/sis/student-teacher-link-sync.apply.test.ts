/**
 * SPE-540 · `applyLinkSyncPlan` — what the writer actually sends.
 *
 * The load-bearing assertions: every write carries the sync's OWN source
 * value ('oneroster' in the VALUES on insert, in the WHERE on update and
 * delete — the second lock that makes a human's link physically untouchable
 * here), counts report what LANDED rather than what was attempted, a school
 * that fails mid-run still leaves an audit record of what it did write, and
 * nothing child- or teacher-identifying reaches the audit trail or a log.
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
  logServerAuditEvent: (...args: unknown[]) => mockAudit(...args),
}));

interface RecordedWrite {
  table: string;
  op: 'upsert' | 'update' | 'delete';
  payload?: unknown;
  options?: unknown;
  filters: [string, unknown][];
}

const writes: RecordedWrite[] = [];

/** Per-test override; default answers every write with "all rows landed". */
let resultFor: (w: RecordedWrite) => { data: unknown[] | null; error: { message: string } | null };

const defaultResultFor = (w: RecordedWrite) => {
  if (w.op === 'upsert') {
    return { data: (w.payload as unknown[]).map((_, i) => ({ id: `ins-${i}` })), error: null };
  }
  if (w.op === 'delete') {
    const inFilter = w.filters.find(([f]) => f === 'in');
    return { data: ((inFilter?.[1] as string[]) ?? []).map((id) => ({ id })), error: null };
  }
  return { data: [{ id: 'updated' }], error: null };
};

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const start = (op: RecordedWrite['op'], payload?: unknown, options?: unknown) => {
        const rec: RecordedWrite = { table, op, payload, options, filters: [] };
        writes.push(rec);
        const chain = {
          eq: (col: string, val: unknown) => {
            rec.filters.push(['eq', [col, val]]);
            return chain;
          },
          in: (col: string, vals: unknown) => {
            rec.filters.push(['in', vals]);
            rec.filters.push(['in-col', col]);
            return chain;
          },
          select: () => Promise.resolve(resultFor(rec)),
        };
        return chain;
      };
      return {
        upsert: (payload: unknown, options: unknown) => start('upsert', payload, options),
        update: (payload: unknown) => start('update', payload),
        delete: () => start('delete'),
      };
    },
  }),
}));

import {
  applyLinkSyncPlan,
  LINK_SOURCE,
  type LinkSchoolPlan,
  type LinkSyncPlan,
} from '@/lib/sis/student-teacher-link-sync';

const CHILD_ID = 'aaaa1111-child-uuid';
const TEACHER_ID = 'bbbb2222-teacher-uuid';

function schoolPlan(overrides: Partial<LinkSchoolPlan> = {}): LinkSchoolPlan {
  return {
    schoolId: 'sch-1',
    schoolName: 'Rodeo Vista Elementary',
    caseloadChildren: 1,
    matchedChildren: 1,
    adds: [],
    removes: [],
    relabels: [],
    unchanged: 0,
    humanLinksKept: 0,
    teachersNotInDirectory: 0,
    unmatched: [],
    noTeachersFound: [],
    ...overrides,
  };
}

function plan(schools: LinkSchoolPlan[]): LinkSyncPlan {
  return {
    refusal: null,
    schools,
    unplacedChildren: 0,
    staleEnrollments: 0,
    feedStudents: 1,
    studentEnrollments: 1,
    teacherEnrollments: 1,
    liveClasses: 1,
  };
}

const apply = (p: LinkSyncPlan) =>
  applyLinkSyncPlan({
    plan: p,
    actorId: 'actor-1',
    connectionId: 'conn-1',
    districtId: 'district-1',
  });

beforeEach(() => {
  jest.clearAllMocks();
  writes.length = 0;
  logCalls.length = 0;
  resultFor = defaultResultFor;
});

describe('what the writer sends', () => {
  it('inserts adds with the sync source, ON CONFLICT ignore, and counts landed rows', async () => {
    const results = await apply(
      plan([
        schoolPlan({
          adds: [{ childId: CHILD_ID, teacherId: TEACHER_ID, subject: 'Room 12', period: '1' }],
        }),
      ]),
    );

    const upsert = writes.find((w) => w.op === 'upsert');
    expect(upsert?.table).toBe('student_teachers');
    expect(upsert?.payload).toEqual([
      {
        child_id: CHILD_ID,
        teacher_id: TEACHER_ID,
        subject: 'Room 12',
        period: '1',
        source: LINK_SOURCE,
      },
    ]);
    expect(upsert?.options).toEqual({ onConflict: 'child_id,teacher_id', ignoreDuplicates: true });
    expect(results[0].added).toBe(1);
  });

  it('a link a human raced in first is not counted as added', async () => {
    resultFor = (w) => (w.op === 'upsert' ? { data: [], error: null } : defaultResultFor(w));
    const results = await apply(
      plan([
        schoolPlan({
          adds: [{ childId: CHILD_ID, teacherId: TEACHER_ID, subject: null, period: null }],
        }),
      ]),
    );
    expect(results[0].added).toBe(0);
  });

  it('relabels and removes both repeat the source lock in their WHERE', async () => {
    await apply(
      plan([
        schoolPlan({
          relabels: [{ linkId: 'link-1', subject: 'New', period: '2' }],
          removes: [{ linkId: 'link-2' }, { linkId: 'link-3' }],
        }),
      ]),
    );

    const update = writes.find((w) => w.op === 'update');
    expect(update?.payload).toEqual({ subject: 'New', period: '2' });
    expect(update?.filters).toContainEqual(['eq', ['id', 'link-1']]);
    expect(update?.filters).toContainEqual(['eq', ['source', LINK_SOURCE]]);

    const del = writes.find((w) => w.op === 'delete');
    expect(del?.filters).toContainEqual(['in', ['link-2', 'link-3']]);
    expect(del?.filters).toContainEqual(['in-col', 'id']);
    expect(del?.filters).toContainEqual(['eq', ['source', LINK_SOURCE]]);
  });

  it('a big cleanup’s removals are chunked so no single request can overflow', async () => {
    const removes = Array.from({ length: 250 }, (_, i) => ({ linkId: `link-${i}` }));
    const results = await apply(plan([schoolPlan({ removes })]));

    const deletes = writes.filter((w) => w.op === 'delete');
    expect(deletes.length).toBe(3); // 100 + 100 + 50
    for (const d of deletes) {
      const ids = d.filters.find(([f]) => f === 'in')?.[1] as string[];
      expect(ids.length).toBeLessThanOrEqual(100);
      expect(d.filters).toContainEqual(['eq', ['source', LINK_SOURCE]]);
    }
    expect(results[0].removed).toBe(250);
  });

  it('a relabel whose row changed hands reports zero, not one', async () => {
    resultFor = (w) => (w.op === 'update' ? { data: [], error: null } : defaultResultFor(w));
    const results = await apply(
      plan([schoolPlan({ relabels: [{ linkId: 'link-1', subject: 'New', period: null }] })]),
    );
    expect(results[0].relabeled).toBe(0);
  });

  it('removals run LAST, after adds and relabels', async () => {
    await apply(
      plan([
        schoolPlan({
          adds: [{ childId: CHILD_ID, teacherId: TEACHER_ID, subject: null, period: null }],
          relabels: [{ linkId: 'link-1', subject: 'New', period: null }],
          removes: [{ linkId: 'link-2' }],
        }),
      ]),
    );
    expect(writes.map((w) => w.op)).toEqual(['upsert', 'update', 'delete']);
  });

  it('a school with nothing to write dials nothing and reports zeros', async () => {
    const results = await apply(plan([schoolPlan()]));
    expect(writes).toHaveLength(0);
    expect(results[0]).toMatchObject({ added: 0, removed: 0, relabeled: 0 });
  });
});

describe('failure honesty', () => {
  it('a refused plan writes NOTHING and throws', async () => {
    const refused: LinkSyncPlan = { ...plan([schoolPlan()]), refusal: 'rosters are off' };
    await expect(apply(refused)).rejects.toThrow(/refused plan/);
    expect(writes).toHaveLength(0);
  });

  it('stop-on-failure: the second school’s error still audits the first school’s writes', async () => {
    resultFor = (w) =>
      w.op === 'delete' ? { data: null, error: { message: 'boom' } } : defaultResultFor(w);
    await expect(
      apply(
        plan([
          schoolPlan({
            adds: [{ childId: CHILD_ID, teacherId: TEACHER_ID, subject: null, period: null }],
          }),
          schoolPlan({
            schoolId: 'sch-2',
            schoolName: 'Crockett Point High',
            removes: [{ linkId: 'link-9' }],
          }),
        ]),
      ),
    ).rejects.toThrow(/Crockett Point High/);

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const audit = mockAudit.mock.calls[0][0];
    expect(audit.action).toBe('sis_link_sync_applied');
    expect(audit.metadata.partial).toBe(true);
    expect(audit.metadata.written).toContainEqual({
      schoolId: 'sch-1',
      added: 1,
      removed: 0,
      relabeled: 0,
    });
  });

  it('a clean run audits partial: false with per-school counts', async () => {
    await apply(
      plan([
        schoolPlan({
          adds: [{ childId: CHILD_ID, teacherId: TEACHER_ID, subject: null, period: null }],
          removes: [{ linkId: 'link-2' }],
        }),
      ]),
    );
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const audit = mockAudit.mock.calls[0][0];
    expect(audit.metadata).toMatchObject({ districtId: 'district-1', partial: false });
    expect(audit.metadata.written).toEqual([
      { schoolId: 'sch-1', added: 1, removed: 1, relabeled: 0 },
    ]);
  });

  it('audit and logs carry counts only — never child or teacher identifiers', async () => {
    await apply(
      plan([
        schoolPlan({
          adds: [{ childId: CHILD_ID, teacherId: TEACHER_ID, subject: 'Room 12', period: '1' }],
        }),
      ]),
    );
    // Non-vacuous: both sinks were written to.
    expect(mockAudit).toHaveBeenCalled();
    expect(logCalls.length).toBeGreaterThan(0);
    const everything = JSON.stringify(mockAudit.mock.calls) + JSON.stringify(logCalls);
    for (const value of [CHILD_ID, TEACHER_ID, 'Room 12']) {
      expect(everything).not.toContain(value);
    }
  });
});
