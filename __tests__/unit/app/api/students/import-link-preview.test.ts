/**
 * SPE-546 · POST /api/students/import-link-preview — the review screen's
 * teacher lookup, and what a refused caller does NOT set in motion.
 *
 * Load-bearing: the district is resolved from OUR schools table via a
 * school the caller provably has access to — the request can never name a
 * district (the SPE-545 lesson, applied from birth here); an unconnected
 * district answers { available: false } without dialling; and nothing a
 * student row carries reaches a log line.
 */
import { NextRequest } from 'next/server';

const PROVIDER_ID = '77777777-7777-4777-8777-777777777777';

let currentUserId: string | null = PROVIDER_ID;
let accessibleSchools: { school_id: string }[] = [{ school_id: 'sch-1' }];
let schoolRow: { district_id: string | null } | null = { district_id: 'district-1' };

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        currentUserId
          ? { data: { user: { id: currentUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    rpc: async (fn: string) => {
      if (fn === 'user_accessible_school_ids') return { data: accessibleSchools, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
    from: (table: string) => {
      if (table === 'schools') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: schoolRow, error: null }),
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
  createServiceClient: () => {
    throw new Error('unexpected service client use in this suite');
  },
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

const mockResolveConnection = jest.fn();
jest.mock('@/lib/sis/connections', () => ({
  resolveOneRosterConnection: (...a: unknown[]) => mockResolveConnection(...a),
}));

const mockLoad = jest.fn();
jest.mock('@/lib/sis/import-link-preview', () => ({
  ...jest.requireActual('@/lib/sis/import-link-preview'),
  loadLinkPreviewInput: (...a: unknown[]) => mockLoad(...a),
}));

import { POST } from '@/app/api/students/import-link-preview/route';
import type { LinkPreviewInput } from '@/lib/sis/import-link-preview';

const INPUT: LinkPreviewInput = {
  feedStudents: [{ sourcedId: 'sis-stu-1', identifier: '33_STU_DS-100' }],
  feedEnrollments: [
    { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
    { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
  ],
  feedClasses: [{ sourcedId: 'cls-1', title: 'Algebra I', periods: ['3'] }],
  schoolTeachers: [{ sisId: 'sis-tch-1', name: 'EBONIE BARNETT' }],
};

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/students/import-link-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );

beforeEach(() => {
  jest.clearAllMocks();
  logCalls.length = 0;
  currentUserId = PROVIDER_ID;
  accessibleSchools = [{ school_id: 'sch-1' }];
  schoolRow = { district_id: 'district-1' };
  mockResolveConnection.mockResolvedValue({
    status: 'connected',
    connection: {
      id: 'conn-1',
      district_id: 'district-1',
      base_url: 'https://district.example.org/admin',
      token_url: 'https://district.example.org/admin/token',
    },
    credential: { clientId: 'consumer-id', clientSecret: 'consumer-secret' },
  });
  mockLoad.mockResolvedValue(INPUT);
});

describe('the gate', () => {
  it('refuses an unauthenticated caller, dialling nothing', async () => {
    currentUserId = null;
    const res = await call({ schoolId: 'sch-1', districtStudentIds: ['DS-100'] });
    expect(res.status).toBe(401);
    expect(mockResolveConnection).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('refuses a school the caller cannot access, dialling nothing', async () => {
    const res = await call({ schoolId: 'sch-other', districtStudentIds: ['DS-100'] });
    expect(res.status).toBe(403);
    expect(mockResolveConnection).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('resolves the district from OUR schools table — never the request', async () => {
    await call({ schoolId: 'sch-1', districtStudentIds: ['DS-100'] });
    expect(mockResolveConnection).toHaveBeenCalledWith('district-1');
  });

  it('refuses an oversized id list at validation, dialling nothing', async () => {
    const res = await call({
      schoolId: 'sch-1',
      districtStudentIds: Array.from({ length: 501 }, (_, i) => `id-${i}`),
    });
    expect(res.status).toBe(400);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe('graceful degradation', () => {
  it('a school with no district answers unavailable without dialling', async () => {
    schoolRow = { district_id: null };
    const res = await call({ schoolId: 'sch-1', districtStudentIds: ['DS-100'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: 'no-sis' });
    expect(mockResolveConnection).not.toHaveBeenCalled();
  });

  it('an unconnected district answers unavailable without dialling the SIS', async () => {
    mockResolveConnection.mockResolvedValue({ status: 'no-connection' });
    const res = await call({ schoolId: 'sch-1', districtStudentIds: ['DS-100'] });
    // 'no-sis' hides the column entirely — no sync exists, so a "will link
    // after import" promise would be false.
    expect(await res.json()).toEqual({ available: false, reason: 'no-sis' });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('a SIS that will not answer degrades to unavailable — no upstream text leaks', async () => {
    mockLoad.mockRejectedValue(new Error('boom: https://district.example.org'));
    const res = await call({ schoolId: 'sch-1', districtStudentIds: ['DS-100'] });
    expect(res.status).toBe(200);
    const body = await res.json();
    // 'sis-unreachable' keeps the column with "Will link after import" —
    // a sync IS configured, unlike the no-sis case above.
    expect(body).toEqual({ available: false, reason: 'sis-unreachable' });
    expect(JSON.stringify(body)).not.toContain('district.example.org');
  });
});

describe('the answer', () => {
  it('serves per-id entries with teacher names and class labels', async () => {
    const res = await call({ schoolId: 'sch-1', districtStudentIds: ['DS-100', 'DS-999'] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.entries['DS-100']).toEqual({
      status: 'matched',
      teachers: [{ name: 'EBONIE BARNETT', subject: 'Algebra I', period: '3' }],
      missingFromDirectory: 0,
    });
    expect(body.entries['DS-999']).toEqual({ status: 'not-found' });
  });

  it('logs counts only — ids and teacher names never reach a log line', async () => {
    await call({ schoolId: 'sch-1', districtStudentIds: ['DS-100'] });
    const logged = JSON.stringify(logCalls);
    expect(logged).toContain('Import link preview served');
    for (const value of ['DS-100', 'BARNETT', 'consumer-secret']) {
      expect(logged).not.toContain(value);
    }
  });
});
