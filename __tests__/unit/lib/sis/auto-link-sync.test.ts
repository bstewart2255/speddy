/**
 * SPE-545 · `runAutoLinkSync` — the unattended runner's plumbing.
 *
 * The engine's own rails are pinned by the SPE-540 suites; this suite pins
 * what the runner adds: connection resolution that no-ops quietly for
 * unconnected districts, the audit-trail debounce, refusals and empty plans
 * writing nothing, the trigger/actor stamp reaching the writer, the
 * NEVER-THROWS contract every caller depends on, and counts-only logs.
 */

const logCalls: unknown[][] = [];
jest.mock('@/lib/logger', () => {
  const record = (...args: unknown[]) => {
    logCalls.push(args);
  };
  const fake = { info: record, warn: record, error: record, debug: record, child: () => fake };
  return { logger: fake };
});

const mockResolveConnection = jest.fn();
jest.mock('@/lib/sis/connections', () => ({
  resolveOneRosterConnection: (...a: unknown[]) => mockResolveConnection(...a),
}));

const mockAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/supabase/audit-log-server', () => ({
  logServerAuditEvent: (...a: unknown[]) => mockAudit(...a),
}));

/** The debounce read's answer; null data + error simulates a broken read. */
let auditRows: { data: unknown[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};
/** Filters the debounce query applied — pinned so scoping can't be dropped. */
const auditFilters: [string, unknown][] = [];
let connectionRows: { data: unknown[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'audit_logs') {
        const chain = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            auditFilters.push(['eq', [col, val]]);
            return chain;
          },
          in: (col: string, vals: unknown) => {
            auditFilters.push(['in', [col, vals]]);
            return chain;
          },
          gte: (col: string) => {
            auditFilters.push(['gte', col]);
            return chain;
          },
          limit: () => Promise.resolve(auditRows),
        };
        return chain;
      }
      if (table === 'district_sis_connections') {
        const chain = {
          select: () => chain,
          eq: () => Promise.resolve(connectionRows),
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const mockLoad = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/sis/student-teacher-link-sync', () => ({
  ...jest.requireActual('@/lib/sis/student-teacher-link-sync'),
  loadLinkSyncInput: (...a: unknown[]) => mockLoad(...a),
  applyLinkSyncPlan: (...a: unknown[]) => mockApply(...a),
}));

import { listAutoSyncDistrictIds, runAutoLinkSync } from '@/lib/sis/auto-link-sync';
import type { LinkPlannerInput } from '@/lib/sis/student-teacher-link-sync';

const CONNECTION = {
  id: 'conn-1',
  district_id: 'district-1',
  sis_type: 'oneroster',
  base_url: 'https://district.example.org/admin',
  token_url: 'https://district.example.org/admin/token',
};

/** One school, one matched child, exactly one link to add. */
const INPUT: LinkPlannerInput = {
  feedStudents: [{ sourcedId: 'sis-stu-1', identifier: 'DS-100' }],
  feedEnrollments: [
    { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
    { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
  ],
  feedClasses: [{ sourcedId: 'cls-1', title: 'Room 12', periods: ['1'] }],
  speddySchools: [{ id: 'sch-1', name: 'Rodeo Vista Elementary' }],
  caseloadRows: [{ childId: 'child-1', districtStudentId: 'DS-100' }],
  childRecords: [
    {
      id: 'child-1',
      schoolId: 'sch-1',
      initials: 'QZ',
      gradeLevel: '3',
      districtStudentId: 'DS-100',
    },
  ],
  sisTeachers: [{ id: 'tch-row-1', schoolId: 'sch-1', sisId: 'sis-tch-1' }],
  existingLinks: [],
};

/** The same district with the roster option off — the planner refuses it. */
const REFUSED_INPUT: LinkPlannerInput = { ...INPUT, feedEnrollments: [] };

/** Already fully linked — a plan with nothing writable. */
const UP_TO_DATE_INPUT: LinkPlannerInput = {
  ...INPUT,
  existingLinks: [
    {
      id: 'link-1',
      childId: 'child-1',
      teacherId: 'tch-row-1',
      subject: 'Room 12',
      period: '1',
      source: 'oneroster',
    },
  ],
};

const run = (trigger: 'import' | 'cron' = 'import', actorId: string | null = 'provider-1') =>
  runAutoLinkSync({ districtId: 'district-1', trigger, actorId });

beforeEach(() => {
  jest.clearAllMocks();
  logCalls.length = 0;
  auditFilters.length = 0;
  auditRows = { data: [], error: null };
  connectionRows = { data: [], error: null };
  mockResolveConnection.mockResolvedValue({
    status: 'connected',
    connection: {
      id: CONNECTION.id,
      district_id: CONNECTION.district_id,
      base_url: CONNECTION.base_url,
      token_url: CONNECTION.token_url,
    },
    credential: { clientId: 'consumer-id', clientSecret: 'consumer-secret' },
  });
  mockLoad.mockResolvedValue(INPUT);
  mockApply.mockResolvedValue([]);
});

describe('quiet no-ops', () => {
  it('a district with no OneRoster connection dials nothing', async () => {
    mockResolveConnection.mockResolvedValue({ status: 'no-connection' });
    expect(await run()).toBe('no-connection');
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('a district with no stored credential dials nothing', async () => {
    mockResolveConnection.mockResolvedValue({ status: 'no-credential', connectionId: CONNECTION.id });
    expect(await run()).toBe('no-connection');
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe('the debounce', () => {
  it('skips when an apply was audited inside the window — scoped to THIS connection', async () => {
    auditRows = { data: [{ id: 'audit-1' }], error: null };
    expect(await run()).toBe('debounced');
    expect(mockLoad).not.toHaveBeenCalled();
    // Dropping either filter would debounce against the wrong events, and
    // dropping the attempted marker re-opens the no-op-runs-never-debounce
    // hole (PR #895 review).
    expect(auditFilters).toContainEqual([
      'in',
      ['action', ['sis_link_sync_applied', 'sis_link_sync_attempted']],
    ]);
    expect(auditFilters).toContainEqual(['eq', ['resource_id', 'conn-1']]);
    expect(auditFilters).toContainEqual(['gte', 'timestamp']);
  });

  it('a broken debounce read proceeds — courtesy, not a safety rail', async () => {
    auditRows = { data: null, error: { message: 'boom' } };
    expect(await run()).toBe('applied');
    expect(mockApply).toHaveBeenCalledTimes(1);
  });
});

describe('what runs and what does not', () => {
  it('applies with the trigger and actor stamped through to the writer', async () => {
    expect(await run('import', 'provider-1')).toBe('applied');
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'provider-1',
        connectionId: 'conn-1',
        districtId: 'district-1',
        trigger: 'import',
      }),
    );
  });

  it('a cron run applies as a system action (null actor)', async () => {
    expect(await run('cron', null)).toBe('applied');
    expect(mockApply.mock.calls[0][0]).toMatchObject({ actorId: null, trigger: 'cron' });
  });

  it('a refused plan writes nothing', async () => {
    mockLoad.mockResolvedValue(REFUSED_INPUT);
    expect(await run()).toBe('refused');
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('an up-to-date district writes nothing — except its debounce marker', async () => {
    mockLoad.mockResolvedValue(UP_TO_DATE_INPUT);
    expect(await run()).toBe('nothing-to-do');
    expect(mockApply).not.toHaveBeenCalled();
    // The marker is what makes the NEXT import in the window debounce
    // instead of walking the SIS again (PR #895 review). Counts-only.
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sis_link_sync_attempted',
        resource_id: 'conn-1',
        metadata: expect.objectContaining({ outcome: 'nothing-to-do', trigger: 'import' }),
      }),
    );
  });

  it('a refused run leaves the marker too; a FAILED run does not (retry wanted)', async () => {
    mockLoad.mockResolvedValue(REFUSED_INPUT);
    await run();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sis_link_sync_attempted',
        metadata: expect.objectContaining({ outcome: 'refused' }),
      }),
    );
    mockAudit.mockClear();
    mockLoad.mockRejectedValue(new Error('sis down'));
    expect(await run()).toBe('failed');
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe('the never-throws contract', () => {
  it('a SIS that will not answer is a failed outcome, not an exception', async () => {
    mockLoad.mockRejectedValue(new Error('boom: https://district.example.org'));
    await expect(run()).resolves.toBe('failed');
  });

  it('a mid-apply failure is a failed outcome, not an exception', async () => {
    mockApply.mockRejectedValue(new Error('Removing stale links at Rodeo Vista failed'));
    await expect(run()).resolves.toBe('failed');
  });

  it('a connection-resolution failure is a failed outcome, not an exception', async () => {
    mockResolveConnection.mockResolvedValue({ status: 'load-failed', phase: 'connections' });
    await expect(run()).resolves.toBe('failed');
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('even a resolver that THROWS is a failed outcome, not an exception', async () => {
    mockResolveConnection.mockRejectedValue(new Error('db down'));
    await expect(run()).resolves.toBe('failed');
  });
});

describe('counts-only logs', () => {
  it('nothing a feed row carries reaches a log line — across every path', async () => {
    await run(); // applied
    mockLoad.mockResolvedValue(REFUSED_INPUT);
    await run(); // refused (logs plan counts)
    mockLoad.mockRejectedValue(new Error('sis boom'));
    await run(); // failed
    expect(logCalls.length).toBeGreaterThan(0);
    const logged = JSON.stringify(logCalls);
    for (const value of ['QZ', 'DS-100', 'child-1', 'consumer-secret']) {
      expect(logged).not.toContain(value);
    }
  });
});

describe('listAutoSyncDistrictIds', () => {
  it('returns distinct, sorted district ids', async () => {
    connectionRows = {
      data: [{ district_id: 'd-2' }, { district_id: 'd-1' }, { district_id: 'd-2' }],
      error: null,
    };
    expect(await listAutoSyncDistrictIds()).toEqual(['d-1', 'd-2']);
  });

  it('throws on a read error (the CALLER isolates it)', async () => {
    connectionRows = { data: null, error: { message: 'denied' } };
    await expect(listAutoSyncDistrictIds()).rejects.toThrow(/Could not list/);
  });
});
