/**
 * SPE-437 · POST /api/internal/sis-connections/[connectionId]/teacher-sync —
 * the staff gate, and what a refused caller does NOT set in motion.
 *
 * Same reasoning as the connection-test handler suite (SPE-427/421): no sim
 * persona is ever `is_speddy_admin`, so the allowed branch is only coverable
 * here. And the load-bearing assertion is not the 403 — it is that NOTHING
 * dials the district's SIS and NOTHING writes when the caller is refused,
 * the body is malformed, or the mode is dry-run.
 */
import { NextRequest } from 'next/server';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const NON_STAFF_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

let currentUserId: string | null = STAFF_ID;
let profileRow: { data: unknown; error: unknown } = {
  data: { is_speddy_admin: true },
  error: null,
};

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
      q.eq = () => q;
      q.maybeSingle = () => Promise.resolve(profileRow);
      return q;
    },
  }),
}));

// Rate limiting writes to the database; it is not what this file is about.
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

const mockGetConnection = jest.fn();
const mockGetCredential = jest.fn();
jest.mock('@/lib/sis/connections', () => ({
  ...jest.requireActual('@/lib/sis/connections'),
  getConnection: (...a: unknown[]) => mockGetConnection(...a),
  getDecryptedCredential: (...a: unknown[]) => mockGetCredential(...a),
}));

// The two functions that reach beyond this process: one dials the SIS, one
// writes the database. Counting their calls is the whole point of this suite.
const mockLoad = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/sis/teacher-directory-sync', () => ({
  ...jest.requireActual('@/lib/sis/teacher-directory-sync'),
  loadTeacherSyncInput: (...a: unknown[]) => mockLoad(...a),
  applyTeacherSyncPlan: (...a: unknown[]) => mockApply(...a),
}));

import { POST } from '@/app/api/internal/sis-connections/[connectionId]/teacher-sync/route';
import type { PlannerInput } from '@/lib/sis/teacher-directory-sync';

const CONNECTION = {
  id: CONNECTION_ID,
  district_id: 'district-1',
  sis_type: 'oneroster',
  base_url: 'https://district.example.org/admin',
  token_url: 'https://district.example.org/admin/token',
  credential_hint: '••••44f2',
  status: 'connected',
};

const CREDENTIAL = {
  sisType: 'oneroster',
  clientId: 'consumer-id',
  clientSecret: 'consumer-secret',
};

/** A one-school input whose plan creates exactly one teacher. */
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
    new NextRequest(`http://localhost/api/internal/sis-connections/${CONNECTION_ID}/teacher-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ connectionId: CONNECTION_ID }) },
  );

/** Every path that reaches beyond this process, in one place. */
const nothingHappened = () => {
  expect(mockLoad).not.toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.clearAllMocks();
  logCalls.length = 0;
  currentUserId = STAFF_ID;
  profileRow = { data: { is_speddy_admin: true }, error: null };
  mockGetConnection.mockResolvedValue(CONNECTION);
  mockGetCredential.mockResolvedValue(CREDENTIAL);
  mockLoad.mockResolvedValue(INPUT);
  mockApply.mockResolvedValue([
    { schoolId: 'sch-1', schoolName: 'Rodeo Vista Elementary', created: 1, adopted: 0, updated: 0 },
  ]);
});

describe('the staff gate', () => {
  it('refuses a signed-in non-staff caller and dials NOTHING', async () => {
    currentUserId = NON_STAFF_ID;
    profileRow = { data: { is_speddy_admin: false }, error: null };
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(403);
    nothingHappened();
  });

  it('refuses an unauthenticated caller and dials NOTHING', async () => {
    currentUserId = null;
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(401);
    nothingHappened();
  });

  it('refuses an unreadable staff verdict (fail closed) and dials NOTHING', async () => {
    profileRow = { data: null, error: { message: 'boom' } };
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(403);
    nothingHappened();
  });
});

describe('input gates', () => {
  it('400s a body without a valid mode, dialling nothing', async () => {
    const res = await call({ mode: 'destroy-everything' });
    expect(res.status).toBe(400);
    nothingHappened();
  });

  it('404s an unknown connection, dialling nothing', async () => {
    mockGetConnection.mockResolvedValue(null);
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(404);
    nothingHappened();
  });

  it('409s an Aeries connection — teacher sync is OneRoster-fed', async () => {
    mockGetConnection.mockResolvedValue({ ...CONNECTION, sis_type: 'aeries' });
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

  it('409s a connection with no saved address, dialling nothing', async () => {
    mockGetConnection.mockResolvedValue({ ...CONNECTION, base_url: null });
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(409);
    nothingHappened();
  });

  it('409s an Aeries credential on the OneRoster path, dialling nothing', async () => {
    mockGetCredential.mockResolvedValue({ ...CREDENTIAL, sisType: 'aeries' });
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(409);
    nothingHappened();
  });

  it('500s a credential that exists but cannot be decrypted — a key fault, not setup guidance', async () => {
    mockGetCredential.mockRejectedValue(new Error('decrypt failed'));
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/could not be decrypted/i);
    nothingHappened();
  });

  it('refuses a non-staff APPLY before anything dials or writes', async () => {
    currentUserId = NON_STAFF_ID;
    profileRow = { data: { is_speddy_admin: false }, error: null };
    const res = await call({ mode: 'apply', expectedChanges: 1 });
    expect(res.status).toBe(403);
    nothingHappened();
  });
});

describe('dry-run vs apply', () => {
  it('dry-run plans from a live read and WRITES NOTHING', async () => {
    const res = await call({ mode: 'dry-run' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('dry-run');
    expect(body.plan.schools[0].creates).toHaveLength(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('apply without the reviewed count is refused at validation, dialling nothing', async () => {
    const res = await call({ mode: 'apply' });
    expect(res.status).toBe(400);
    nothingHappened();
  });

  it('apply refuses with 409 when the recomputed plan differs from the approved count', async () => {
    // The operator approved 3 changes; the fresh plan writes 1 — the feed
    // moved between preview and apply, so nothing may be written.
    const res = await call({ mode: 'apply', expectedChanges: 3 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/changed since your preview/i);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('apply recomputes the plan server-side and passes THAT to the writer', async () => {
    const res = await call({ mode: 'apply', expectedChanges: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('apply');
    expect(body.written).toEqual([
      expect.objectContaining({ schoolId: 'sch-1', created: 1 }),
    ]);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    // The plan the writer received came from the fresh load, not the request.
    const applied = mockApply.mock.calls[0][0] as { plan: { schools: unknown[] } };
    expect(applied.plan.schools).toHaveLength(1);
  });

  it('logs counts only — the feed names and emails never reach a log line', async () => {
    await call({ mode: 'dry-run' });
    const logged = JSON.stringify(logCalls);
    expect(logged).toContain('Teacher directory sync planned');
    for (const value of ['DANA', 'WHITFIELD', 'dwhitfield@example.org']) {
      expect(logged).not.toContain(value);
    }
  });
});
