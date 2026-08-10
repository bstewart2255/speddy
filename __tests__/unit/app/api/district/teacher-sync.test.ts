/**
 * SPE-438 · POST /api/district/teacher-sync — the district admin's own
 * Preview → Apply, and what a refused caller does NOT set in motion.
 *
 * Same posture as the sis-directory suite (SPE-436) plus the internal
 * teacher-sync suite (SPE-437): the load-bearing assertions are that nothing
 * dials the district's SIS and nothing writes — accounts included — unless a
 * district admin, in their own district, with a stored credential, asked.
 * `district_tech` is refused here on purpose: this surface serves teacher
 * PII and provisions sign-in accounts, both outside that role's
 * integrations-only line (SPE-393).
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

const mockListConnections = jest.fn();
const mockGetCredential = jest.fn();
jest.mock('@/lib/sis/connections', () => ({
  ...jest.requireActual('@/lib/sis/connections'),
  listConnections: (...a: unknown[]) => mockListConnections(...a),
  getDecryptedCredential: (...a: unknown[]) => mockGetCredential(...a),
}));

// The two functions that reach beyond this process: one dials the SIS, one
// writes the database and provisions accounts.
const mockLoad = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/sis/teacher-directory-sync', () => ({
  ...jest.requireActual('@/lib/sis/teacher-directory-sync'),
  loadTeacherSyncInput: (...a: unknown[]) => mockLoad(...a),
  applyTeacherSyncPlan: (...a: unknown[]) => mockApply(...a),
}));

import { POST } from '@/app/api/district/teacher-sync/route';
import type { PlannerInput } from '@/lib/sis/teacher-directory-sync';

const CONNECTION = {
  id: 'conn-1',
  district_id: DISTRICT_ID,
  sis_type: 'oneroster',
  base_url: 'https://district.example.org/admin',
  token_url: 'https://district.example.org/admin/token',
};

/** A one-school input whose plan creates exactly one teacher (with email). */
const INPUT: PlannerInput = {
  feedSchools: [{ sourcedId: 'org-1', name: 'Rodeo Vista Elementary School' }],
  feedTeachers: [
    {
      sourcedId: 't-1',
      firstName: 'DANA',
      lastName: 'WHITFIELD',
      email: 'dwhitfield@example.org',
      identifier: '11_TCH_1',
      grades: ['KG'],
      orgIds: ['org-1'],
      isTeacher: true,
    },
  ],
  speddySchools: [{ id: 'sch-1', name: 'Rodeo Vista Elementary' }],
  existingTeachers: [],
  studentCounts: { 'sch-1': 4 },
};

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/district/teacher-sync', {
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
  mockListConnections.mockResolvedValue([CONNECTION]);
  mockGetCredential.mockResolvedValue({
    sisType: 'oneroster',
    clientId: 'consumer-id',
    clientSecret: 'consumer-secret',
  });
  mockLoad.mockResolvedValue(INPUT);
  mockApply.mockResolvedValue([
    {
      schoolId: 'sch-1',
      schoolName: 'Rodeo Vista Elementary',
      created: 1,
      adopted: 0,
      updated: 0,
      accountsCreated: 1,
      directoryOnly: 0,
      accountConflicts: [],
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

  it('refuses district_tech — accounts and teacher PII are beyond its line', async () => {
    mockResolveCaller.mockResolvedValue({
      ok: true,
      role: 'district_tech',
      districtId: DISTRICT_ID,
    });
    holdsAdminGrant = false;
    const res = await call({ mode: 'apply', expectedChanges: 1 });
    expect(res.status).toBe(403);
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
    mockListConnections.mockResolvedValue([{ ...CONNECTION, sis_type: 'aeries' }]);
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(409);
    nothingHappened();
  });

  it('409s when no credential is stored, dialling nothing', async () => {
    mockGetCredential.mockResolvedValue(null);
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(409);
    nothingHappened();
  });

  it('500s a credential that cannot be decrypted, dialling nothing', async () => {
    mockGetCredential.mockRejectedValue(new Error('decrypt failed'));
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
    expect(body.plan.schools[0].creates).toHaveLength(1);
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

  it('apply passes the fresh plan to the writer and reports accounts created', async () => {
    const res = await call({ mode: 'apply', expectedChanges: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.written).toEqual([
      expect.objectContaining({ schoolId: 'sch-1', created: 1, accountsCreated: 1 }),
    ]);
    expect(mockApply).toHaveBeenCalledTimes(1);
    // The connection came from the CALLER's grants, never from the request.
    expect(mockApply.mock.calls[0][0]).toMatchObject({
      actorId: ADMIN_ID,
      connectionId: CONNECTION.id,
      districtId: DISTRICT_ID,
    });
  });

  it('logs counts only — feed names and emails never reach a log line', async () => {
    await call({ mode: 'dry-run' });
    const logged = JSON.stringify(logCalls);
    expect(logged).toContain('Teacher directory sync planned by district admin');
    for (const value of ['DANA', 'WHITFIELD', 'dwhitfield@example.org']) {
      expect(logged).not.toContain(value);
    }
  });
});
