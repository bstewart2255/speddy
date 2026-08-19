/**
 * SPE-437/438 · `applyTeacherSyncPlan` — what the writes actually carry, and
 * what is never written at all.
 *
 * The supabase stub records every query-builder call, so the assertions are
 * about the WRITE SHAPE: creates carry the SIS key, school placement, and —
 * when the feed has an email — a freshly provisioned sign-in account (auth
 * user + profile RPC + linked row, mirroring the admin creation route);
 * adoption re-checks `sis_id IS NULL`; keyed updates filter on the full key;
 * refused schools see no writes; an already-registered email lands the row
 * accountless in the conflicts bucket; and counts come from what the
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

/**
 * Reference reads performed by `pinProfileScopeFromSchool` (SPE-570): the
 * school's district, then that district's state. Answered here rather than in
 * each test's `nextResult` because they are lookups, not the write shape under
 * test — every test needs them to succeed, and none is asserting on them.
 */
const SCOPE_LOOKUPS: Record<string, { data: unknown; error: unknown }> = {
  'admin:schools': { data: { district_id: 'district-1' }, error: null },
  'admin:districts': { data: { state_id: 'CA' }, error: null },
};

function makeFrom(table: string): Record<string, unknown> {
  const record: RecordedQuery = { table, calls: [], result: { data: [], error: null } };
  recorded.push(record);
  const chain: Record<string, unknown> = {};
  for (const method of ['insert', 'update', 'delete', 'select', 'eq', 'is', 'in', 'single']) {
    chain[method] = (...args: unknown[]) => {
      record.calls.push({ method, args });
      return chain;
    };
  }
  // Thenable, like the real builder: awaiting the chain resolves it.
  chain.then = (resolve: (v: unknown) => unknown) => {
    record.result = SCOPE_LOOKUPS[record.table] ?? nextResult(record);
    return Promise.resolve(record.result).then(resolve);
  };
  return chain;
}

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => makeFrom(table) }),
}));

// The raw admin client the module builds for auth work — same recording
// approach so "who got an account" is an assertion, not an assumption.
const mockCreateUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockRpc = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: {
        createUser: (...a: unknown[]) => mockCreateUser(...a),
        deleteUser: (...a: unknown[]) => mockDeleteUser(...a),
      },
    },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) => makeFrom(`admin:${table}`),
  }),
}));

import {
  applyTeacherSyncPlan,
  type SchoolPlan,
  type TeacherSyncPlan,
} from '@/lib/sis/teacher-directory-sync';

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
});
afterAll(() => {
  // Jest shares a worker between files; leaked env values would follow it.
  if (savedEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  if (savedEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key;
});

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

let nextUserId = 0;
beforeEach(() => {
  recorded.length = 0;
  logCalls.length = 0;
  nextUserId = 0;
  mockAudit.mockClear();
  mockCreateUser.mockReset().mockImplementation(async () => {
    nextUserId += 1;
    return { data: { user: { id: `auth-${nextUserId}`, email: 'x' } }, error: null };
  });
  mockDeleteUser.mockReset().mockResolvedValue({ data: null, error: null });
  mockRpc.mockReset().mockResolvedValue({ error: null });
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
  it('writes creates with the SIS key, school placement, verbatim names — and a linked account', async () => {
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
        account_id: 'auth-1',
      },
    ]);
    // The account mirrored the admin-creation route: pre-verified email, a
    // random password that is never surfaced, teacher-role metadata, and the
    // profile RPC + school stamp.
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'comalley@example.org',
        email_confirm: true,
        user_metadata: expect.objectContaining({ role: 'teacher' }),
      }),
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'create_profile_for_new_user',
      expect.objectContaining({ user_id: 'auth-1' }),
    );
    // The profile is scoped with all THREE ids. The RPC above resolves none of
    // them (it name-matches on the district/state strings this caller passes
    // as ''), so stamping school_id alone is what left every sync-provisioned
    // teacher district-less — 110 rows in production before SPE-570.
    const profileScope = recorded.find(
      (q) => q.table === 'admin:profiles' && q.calls.some((c) => c.method === 'update'),
    );
    expect(profileScope).toBeDefined();
    expect(profileScope!.calls.find((c) => c.method === 'update')!.args[0]).toEqual({
      school_id: 'sch-elem',
      district_id: 'district-1',
      state_id: 'CA',
    });
    expect(results).toEqual([
      {
        schoolId: 'sch-elem',
        schoolName: 'Rodeo Vista Elementary',
        created: 1,
        adopted: 1,
        updated: 1,
        accountsCreated: 1,
        directoryOnly: 0,
        accountConflicts: [],
      },
    ]);
  });

  it('an already-registered email lands the row ACCOUNTLESS in the conflicts bucket', async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    });

    const results = await run();

    expect(results[0].accountsCreated).toBe(0);
    expect(results[0].accountConflicts).toEqual([
      { name: 'CHARLI OMALLEY', email: 'comalley@example.org' },
    ]);
    // The directory row still landed — accountless.
    const insert = recorded.find((q) => q.calls.some((c) => c.method === 'insert'));
    const rows = insert!.calls.find((c) => c.method === 'insert')!.args[0] as Record<
      string,
      unknown
    >[];
    expect(rows[0].account_id).toBeNull();
    // And nothing was touched on the existing identity.
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('a create without an email is directory-only — no account attempt at all', async () => {
    const emaillessPlan: TeacherSyncPlan = {
      ...plan,
      schools: [
        {
          ...plan.schools[0],
          adopts: [],
          updates: [],
          creates: [
            {
              sisId: 'sid-noemail',
              firstName: 'NO',
              lastName: 'EMAIL',
              email: null,
              staffId: '11_TCH_9',
              gradeLevel: null,
            },
          ],
        },
      ],
    };
    const results = await applyTeacherSyncPlan({
      plan: emaillessPlan,
      actorId: 'staff-1',
      connectionId: 'conn-1',
      districtId: 'district-1',
    });

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ created: 1, accountsCreated: 0, directoryOnly: 1 });
  });

  it('a profile failure rolls back ITS auth user — profile row FIRST, then auth — and stops', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'rpc exploded' } });
    await expect(run()).rejects.toThrow(/Profile creation failed/);
    // Order is load-bearing: profiles.id → auth.users(id) has no cascade, so
    // deleting the auth user first would fail on the FK (PR #833 review).
    const profileDelete = recorded.find(
      (q) => q.table === 'admin:profiles' && q.calls.some((c) => c.method === 'delete'),
    );
    expect(profileDelete).toBeDefined();
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-1');
    // Partial outcome still audited (nothing written yet for this school).
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ partial: true }) }),
    );
  });

  it('a FAILED rollback is logged loudly by account id — never swallowed', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'rpc exploded' } });
    // The admin API RESOLVES with { error }, it does not reject — the exact
    // shape the first version's empty .catch() could never observe.
    mockDeleteUser.mockResolvedValue({ data: null, error: { message: 'FK still references' } });
    await expect(run()).rejects.toThrow(/Profile creation failed/);
    const logged = JSON.stringify(logCalls);
    // Rollback now runs through the shared `rollbackProvisionedAccount`
    // (SPE-570), so the wording comes from there. What matters is unchanged
    // and is what these assert: the failure is logged rather than swallowed,
    // it names the account id an operator has to chase, and it carries the
    // reason the delete was refused.
    expect(logged).toContain('Rollback could not remove the auth user');
    expect(logged).toContain('auth-1');
    expect(logged).toContain('FK still references');
  });

  it('conflict detection honors the stable email_exists code, without prose', async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Unprocessable Entity', code: 'email_exists' },
    });
    const results = await run();
    expect(results[0].accountConflicts).toHaveLength(1);
  });

  it('a multi-school teacher gets ONE account, linked at every school', async () => {
    const twoSchoolPlan: TeacherSyncPlan = {
      ...plan,
      schools: [
        {
          ...plan.schools[0],
          adopts: [],
          updates: [],
          creates: [
            {
              sisId: 'sid-multi',
              firstName: 'SAMUEL',
              lastName: 'DAVIS',
              email: 'sdavis@example.org',
              staffId: '33_TCH_779',
              gradeLevel: null,
            },
          ],
        },
        {
          ...plan.schools[0],
          schoolId: 'sch-high',
          schoolName: 'Crockett Point High',
          refusal: null,
          adopts: [],
          updates: [],
          creates: [
            {
              sisId: 'sid-multi',
              firstName: 'SAMUEL',
              lastName: 'DAVIS',
              email: 'sdavis@example.org',
              staffId: '33_TCH_779',
              gradeLevel: null,
            },
          ],
        },
      ],
      shadowDuplicates: 0,
      duplicateEmailAnomalies: 0,
    };
    const results = await applyTeacherSyncPlan({
      plan: twoSchoolPlan,
      actorId: 'staff-1',
      connectionId: 'conn-1',
      districtId: 'district-1',
    });

    // One human, one account — created once, never misread as a conflict.
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.accountsCreated)).toEqual([1, 0]);
    expect(results.flatMap((r) => r.accountConflicts)).toHaveLength(0);
    // Both directory rows link the same account.
    const inserts = recorded
      .filter((q) => q.table === 'teachers' && q.calls.some((c) => c.method === 'insert'))
      .map((q) => (q.calls.find((c) => c.method === 'insert')!.args[0] as { account_id: unknown }[])[0]);
    expect(inserts.map((r) => r.account_id)).toEqual(['auth-1', 'auth-1']);
  });

  it('outcome counters move only AFTER the row lands — a failed insert reports nothing', async () => {
    const emaillessPlan: TeacherSyncPlan = {
      ...plan,
      schools: [
        {
          ...plan.schools[0],
          adopts: [],
          updates: [],
          creates: [
            {
              sisId: 'sid-noemail',
              firstName: 'NO',
              lastName: 'EMAIL',
              email: null,
              staffId: '11_TCH_9',
              gradeLevel: null,
            },
          ],
        },
      ],
    };
    nextResult = (q) => {
      const insert = q.calls.find((c) => c.method === 'insert');
      if (insert) return { data: null, error: { message: 'insert refused' } };
      return { data: [{ id: 'touched' }], error: null };
    };
    await expect(
      applyTeacherSyncPlan({
        plan: emaillessPlan,
        actorId: 'staff-1',
        connectionId: 'conn-1',
        districtId: 'district-1',
      }),
    ).rejects.toThrow(/insert refused/);
    // The partial audit must not claim a directory-only row that never landed.
    const auditWritten = JSON.stringify(mockAudit.mock.calls);
    expect(auditWritten).toContain('"directoryOnly":0');
  });

  it('never writes anything for a refused school — and provisions no account', async () => {
    await run();
    const serialized = JSON.stringify(recorded.map((q) => q.calls));
    expect(serialized).not.toContain('sid-refused');
    expect(serialized).not.toContain('NEVER');
    const accountEmails = JSON.stringify(mockCreateUser.mock.calls);
    expect(accountEmails).not.toContain('nw@example.org');
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
      expect.objectContaining({
        action: 'sis_teacher_sync_applied',
        metadata: expect.objectContaining({ partial: false }),
      }),
    );
    const everything = JSON.stringify([mockAudit.mock.calls, logCalls]);
    for (const value of ['CHARLI', 'OMALLEY', 'comalley@example.org', 'Hand Entered']) {
      expect(everything).not.toContain(value);
    }
  });

  it('a failed insert throws with the school named — partial outcome audited, orphan account removed', async () => {
    // Writes that landed before the failure are real; a staff-gated
    // service-role write path must never leave them unrecorded
    // (CodeRabbit, PR #831). And an account whose directory row never landed
    // must not survive — a re-run only reads `teachers` and would try again.
    nextResult = (q) => {
      const insert = q.calls.find((c) => c.method === 'insert');
      if (insert) return { data: null, error: { message: 'unique violation' } };
      return { data: [{ id: 'touched' }], error: null };
    };
    await expect(run()).rejects.toThrow(/Rodeo Vista Elementary failed: unique violation/);
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-1');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sis_teacher_sync_applied',
        metadata: expect.objectContaining({ partial: true }),
      }),
    );
    // Still counts only, even on the failure path.
    const everything = JSON.stringify([mockAudit.mock.calls, logCalls]);
    for (const value of ['CHARLI', 'OMALLEY', 'comalley@example.org']) {
      expect(everything).not.toContain(value);
    }
  });
});
