/**
 * SPE-540 · POST /api/district/link-sync — the district admin's Preview →
 * Apply for student↔teacher links, and what a refused caller does NOT set in
 * motion.
 *
 * Same posture as the teacher-sync suite (SPE-438): the load-bearing
 * assertions are that nothing dials the district's SIS and nothing writes
 * child records unless a district admin, in their own district, with a
 * stored credential, asked. `district_tech` is refused on purpose — this
 * surface serves student initials and writes child records, both outside
 * that role's integrations-only line (SPE-393). The shared gate is exercised
 * THROUGH this route, which also covers the SPE-540 extraction not having
 * changed the teacher-sync route's behavior (its own suite pins that side).
 */
import { NextRequest } from 'next/server';

const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const DISTRICT_ID = '0618990';

let currentUserId: string | null = ADMIN_ID;
/** Whether the grant re-check finds a district_admin row for a tech-role caller. */
let holdsAdminGrant = false;
/** Every filter the grant re-check applied — the cross-district scoping pin. */
const mockGrantFilters: [string, unknown][] = [];

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        currentUserId
          ? { data: { user: { id: currentUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, val: unknown) => {
        mockGrantFilters.push([col, val]);
        return q;
      };
      q.limit = () => q;
      q.maybeSingle = () =>
        Promise.resolve({ data: holdsAdminGrant ? { id: 'grant-1' } : null, error: null });
      return q;
    },
  }),
}));

jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

const logCalls: unknown[][] = [];
jest.mock('@/lib/logger', () => {
  const record = (...args: unknown[]) => {
    logCalls.push(args);
  };
  const fake = { info: record, warn: record, error: record, debug: record, child: () => fake };
  return { logger: fake };
});

const mockResolveCaller = jest.fn();
jest.mock('@/lib/api/district-sis-caller', () => ({
  resolveDistrictSisCaller: (...a: unknown[]) => mockResolveCaller(...a),
}));

const mockResolveConnection = jest.fn();
jest.mock('@/lib/sis/connections', () => ({
  ...jest.requireActual('@/lib/sis/connections'),
  resolveOneRosterConnection: (...a: unknown[]) => mockResolveConnection(...a),
}));

// The two functions that reach beyond this process: one dials the SIS, one
// writes child records.
const mockLoad = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/sis/student-teacher-link-sync', () => ({
  ...jest.requireActual('@/lib/sis/student-teacher-link-sync'),
  loadLinkSyncInput: (...a: unknown[]) => mockLoad(...a),
  applyLinkSyncPlan: (...a: unknown[]) => mockApply(...a),
}));

import { POST } from '@/app/api/district/link-sync/route';
import type { LinkPlannerInput } from '@/lib/sis/student-teacher-link-sync';

const CONNECTION = {
  id: 'conn-1',
  district_id: DISTRICT_ID,
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

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/district/link-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );

const nothingHappened = () => {
  expect(mockLoad).not.toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.clearAllMocks();
  logCalls.length = 0;
  currentUserId = ADMIN_ID;
  holdsAdminGrant = false;
  mockResolveCaller.mockResolvedValue({ ok: true, role: 'district_admin', districtId: DISTRICT_ID });
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
  mockApply.mockResolvedValue([
    {
      schoolId: 'sch-1',
      schoolName: 'Rodeo Vista Elementary',
      added: 1,
      removed: 0,
      relabeled: 0,
    },
  ]);
});

describe('the gate', () => {
  it('refuses an unauthenticated caller, dialling nothing', async () => {
    currentUserId = null;
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(401);
    nothingHappened();
  });

  it('refuses a caller with no district grant at all, dialling nothing', async () => {
    mockResolveCaller.mockResolvedValue({ ok: false, denied: 'no-grant' });
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(403);
    nothingHappened();
  });

  it('refuses district_tech — child records are beyond its line', async () => {
    mockResolveCaller.mockResolvedValue({
      ok: true,
      role: 'district_tech',
      districtId: DISTRICT_ID,
    });
    holdsAdminGrant = false;
    const res = await call({ mode: 'apply', expectedChanges: 1 });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/class roster sync is for district admins/);
    nothingHappened();
  });

  it('admits a dual-role caller whose grants include district_admin — scoped to CALLER and DISTRICT', async () => {
    mockResolveCaller.mockResolvedValue({
      ok: true,
      role: 'district_tech',
      districtId: DISTRICT_ID,
    });
    holdsAdminGrant = true;
    mockGrantFilters.length = 0;
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(200);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    // The re-check must filter on this caller, this role, this district — a
    // dropped filter would admit an admin of a DIFFERENT district.
    expect(mockGrantFilters).toEqual(
      expect.arrayContaining([
        ['admin_id', ADMIN_ID],
        ['role', 'district_admin'],
        ['district_id', DISTRICT_ID],
      ]),
    );
  });
});

describe('connection gates', () => {
  it('409s when the district has no OneRoster connection, dialling nothing', async () => {
    mockResolveConnection.mockResolvedValue({ status: 'no-connection' });
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(409);
    nothingHappened();
  });

  it('409s when no credential is stored, dialling nothing', async () => {
    mockResolveConnection.mockResolvedValue({ status: 'no-credential', connectionId: CONNECTION.id });
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(409);
    nothingHappened();
  });

  it('500s a credential that cannot be decrypted, dialling nothing', async () => {
    mockResolveConnection.mockResolvedValue({ status: 'load-failed', phase: 'credential', connectionId: CONNECTION.id });
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(500);
    nothingHappened();
  });
});

describe('dry-run vs apply', () => {
  it('dry-run plans from a live read and never reaches the writer', async () => {
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('dry-run');
    expect(body.plan.schools[0].adds).toHaveLength(1);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('apply without the reviewed count is refused at validation, dialling nothing', async () => {
    const res = await call({ mode: 'apply' });
    expect(res.status).toBe(400);
    nothingHappened();
  });

  it('apply refuses with 409 when the plan moved since the preview — nothing written', async () => {
    const res = await call({ mode: 'apply', expectedChanges: 3 });
    expect(res.status).toBe(409);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('apply refuses a REFUSED plan outright — even at a matching count of zero', async () => {
    mockLoad.mockResolvedValue(REFUSED_INPUT);
    const res = await call({ mode: 'apply', expectedChanges: 0 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Nothing can be applied/);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('apply passes the fresh plan to the writer and reports what landed', async () => {
    const res = await call({ mode: 'apply', expectedChanges: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.written).toEqual([
      expect.objectContaining({ schoolId: 'sch-1', added: 1 }),
    ]);
    expect(mockApply).toHaveBeenCalledTimes(1);
    // The connection came from the CALLER's grants, never from the request.
    expect(mockApply.mock.calls[0][0]).toMatchObject({
      actorId: ADMIN_ID,
      connectionId: CONNECTION.id,
      districtId: DISTRICT_ID,
    });
  });

  it('502s a SIS that will not answer, writing nothing', async () => {
    mockLoad.mockRejectedValue(new Error('boom: https://district.example.org'));
    const res = await call({ mode: 'apply', expectedChanges: 1 });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toContain('district.example.org');
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('a mid-apply failure answers 500, sanitized, and admits changes may be saved', async () => {
    mockApply.mockRejectedValue(
      new Error('Removing stale links at Rodeo Vista Elementary failed: relation "student_teachers" denied'),
    );
    const res = await call({ mode: 'apply', expectedChanges: 1 });
    expect(res.status).toBe(500);
    const body = await res.json();
    // Honest about partial state, silent about database internals.
    expect(body.error).toMatch(/may already be saved/);
    expect(body.error).not.toContain('student_teachers');
    expect(body.error).not.toContain('Rodeo Vista');
  });

  it('logs counts only — initials and district numbers never reach a log line', async () => {
    await call({ mode: 'dry-run' });
    const logged = JSON.stringify(logCalls);
    expect(logged).toContain('Link sync planned by district admin');
    for (const value of ['QZ', 'DS-100', 'child-1']) {
      expect(logged).not.toContain(value);
    }
  });
});
