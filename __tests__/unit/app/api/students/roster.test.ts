/**
 * SPE-447 slice 2 · GET/POST /api/students/roster.
 *
 * The load-bearing assertion is that the request cannot widen what gets
 * written: it names a student and a field, never a value, and anything the
 * freshly recomputed plan does not currently offer is refused rather than
 * trusted. The database enforces the claim rule itself (claim_roster_children);
 * these tests pin that this route never reaches around it.
 *
 * All data is fictional.
 */
import { NextRequest } from 'next/server';

const PROVIDER = '55555555-5555-4555-8555-555555555555';
const CHILD_A = '11111111-1111-4111-8111-111111111111';
const CHILD_B = '22222222-2222-4222-8222-222222222222';
const CHILD_C = '44444444-4444-4444-8444-444444444444';
const STUDENT_1 = '33333333-3333-4333-8333-333333333333';

let currentUserId: string | null = PROVIDER;
/** The caller's profile role — what the provider gate reads. */
let currentRole: string | null = 'resource';

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        currentUserId
          ? { data: { user: { id: currentUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            currentRole ? { data: { role: currentRole }, error: null } : { data: null, error: null },
        }),
      }),
    }),
  }),
  createServiceClient: () => ({ from: () => ({ select: () => ({ in: () => ({ data: [], error: null }) }) }) }),
}));

jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock('@/lib/logger', () => {
  const noop = () => {};
  const fake = { info: noop, warn: noop, error: noop, debug: noop, child: () => fake };
  return { logger: fake };
});

const mockLoad = jest.fn();
const mockClaim = jest.fn();
const mockAccept = jest.fn();
const mockEnrich = jest.fn();
jest.mock('@/lib/district-roster/claim-io', () => ({
  loadProviderRosterContext: (...a: unknown[]) => mockLoad(...a),
  claimRosterChildren: (...a: unknown[]) => mockClaim(...a),
  applyRosterAcceptances: (...a: unknown[]) => mockAccept(...a),
  enrichClaimedStudents: (...a: unknown[]) => mockEnrich(...a),
}));

import { GET, POST } from '@/app/api/students/roster/route';
import type { ProviderRosterContext } from '@/lib/district-roster/claim-io';

/**
 * Two claimable children — one the district names THIS caller as case manager
 * for, one it names somebody else for — plus one of theirs with a blank the
 * roster can fill.
 *
 * TYPED as the loader's own return so the fixture cannot drift from the shape
 * the route actually receives — `mockResolvedValue` would accept anything.
 */
const CONTEXT: ProviderRosterContext = {
  schoolIds: ['sch-rodeo'],
  myName: 'Rosa Delgado',
  rosterChildren: [
    {
      id: CHILD_A,
      initials: 'AA',
      firstName: 'Ana',
      lastName: 'Alvarez',
      gradeLevel: '1',
      schoolId: 'sch-rodeo',
      districtStudentId: '100001',
      dateOfBirth: '2019-05-04',
      upcomingIepDate: '2027-02-09',
      upcomingTriennialDate: '2029-02-09',
      caseManager: 'Rosa Delgado',
      accommodations: ['Extended time'],
      testingAccommodations: [],
      districtServices: [
        {
          code: '330',
          name: 'Specialized Academic Instruction',
          minutes: 60,
          frequency: 'weekly' as const,
          weeklyMinutes: 60,
        },
      ],
      districtGoals: null,
      caseloadCount: 0,
    },
    {
      id: CHILD_B,
      initials: 'BB',
      firstName: 'Ben',
      lastName: 'Bishop',
      gradeLevel: '3',
      schoolId: 'sch-rodeo',
      districtStudentId: '200002',
      dateOfBirth: null,
      upcomingIepDate: '2027-06-01',
      upcomingTriennialDate: null,
      caseManager: 'Someone Else',
      accommodations: [],
      testingAccommodations: [],
      districtServices: null,
      districtGoals: null,
      caseloadCount: 1,
    },
    {
      id: CHILD_C,
      initials: 'CC',
      firstName: 'Cara',
      lastName: 'Cole',
      gradeLevel: '2',
      schoolId: 'sch-rodeo',
      districtStudentId: '300003',
      dateOfBirth: null,
      upcomingIepDate: null,
      upcomingTriennialDate: null,
      caseManager: 'Owen Pike',
      accommodations: [],
      testingAccommodations: [],
      districtServices: null,
      districtGoals: null,
      caseloadCount: 0,
    },
  ],
  myStudents: [
    {
      studentId: STUDENT_1,
      childId: CHILD_B,
      initials: 'BB',
      firstName: 'Ben',
      lastName: 'Bishop',
      gradeLevel: '3',
      districtStudentId: '200002',
      dateOfBirth: null,
      upcomingIepDate: null,
      upcomingTriennialDate: null,
      sessionsPerWeek: null,
      minutesPerSession: null,
      accommodations: [],
      testingAccommodations: [],
      iepGoals: [],
    },
  ],
  myRole: 'resource',
  schoolLevels: {},
};

const call = (method: 'GET' | 'POST', body?: unknown) => {
  const req = new NextRequest('http://localhost/api/students/roster', {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const ctx = { params: Promise.resolve({}) };
  return method === 'GET' ? GET(req, ctx) : POST(req, ctx);
};

beforeEach(() => {
  jest.clearAllMocks();
  currentUserId = PROVIDER;
  currentRole = 'resource';
  mockLoad.mockResolvedValue(CONTEXT);
  mockClaim.mockResolvedValue([{ childId: CHILD_A, studentId: 'new-stu', outcome: 'claimed' }]);
  mockAccept.mockResolvedValue({ applied: 1, skipped: 0 });
  mockEnrich.mockResolvedValue({ enriched: 0, enrichFailures: 0 });
});

describe('GET — what am I offered', () => {
  it('refuses an unauthenticated caller, reading nothing', async () => {
    currentUserId = null;
    const res = await call('GET');
    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('refuses a teacher — the roster is read with the service client', async () => {
    // `user_accessible_school_ids()` answers for teachers too, so without a
    // role gate this would hand them names, district student ids and IEP dates
    // for every unserved student on their school's roster.
    currentRole = 'teacher';
    const res = await call('GET');

    expect(res.status).toBe(403);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it.each(['sea', 'site_admin', 'district_admin', null])(
    'refuses role %s as well',
    async (role) => {
      currentRole = role as string | null;
      const res = await call('GET');
      expect(res.status).toBe(403);
      expect(mockLoad).not.toHaveBeenCalled();
    },
  );

  it('returns the claimable students and the out-of-date ones', async () => {
    const res = await call('GET');
    expect(res.status).toBe(200);

    const { plan, hasOffers } = await res.json();
    expect(hasOffers).toBe(true);
    expect(plan.counts).toMatchObject({ claimable: 2, updates: 1, fills: 1, conflicts: 0 });
    expect(plan.claimable.map((c: { childId: string }) => c.childId)).toEqual([CHILD_A, CHILD_C]);
    // The district names this caller as case manager for CHILD_A, so it arrives
    // pre-ticked — and names someone else for CHILD_C, which must NOT. A
    // pre-ticked box is the thing people stop reading, so a wrong one puts a
    // student on the wrong caseload.
    expect(plan.counts.suggested).toBe(1);
    expect(plan.claimable[0].suggested).toBe(true);
    expect(plan.claimable[1].suggested).toBe(false);
    expect(plan.claimable[1].caseManager).toBe('Owen Pike');
    expect(plan.updates[0].changes[0]).toMatchObject({
      field: 'upcomingIepDate',
      kind: 'fill',
      roster: '2027-06-01',
    });
  });

  it('answers 502 without leaking database detail', async () => {
    mockLoad.mockRejectedValue(new Error('relation "children" does not exist'));
    const res = await call('GET');

    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toMatch(/children|relation/);
  });
});

describe('POST — taking them', () => {
  it('claims a student the roster currently offers', async () => {
    const res = await call('POST', { claimChildIds: [CHILD_A] });
    expect(res.status).toBe(200);

    expect(mockClaim).toHaveBeenCalledWith([CHILD_A]);
    expect(await res.json()).toMatchObject({ claimed: 1, takenBySomeoneElse: 0, duplicateInitials: 0 });
  });

  it('never forwards a child the plan does not offer', async () => {
    // CHILD_B is already served — the database would refuse it, and this route
    // must not even ask.
    const res = await call('POST', { claimChildIds: [CHILD_B] });

    expect(res.status).toBe(200);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ claimed: 0, takenBySomeoneElse: 1 });
  });

  it('applies accepted fields from the recomputed plan, not from the request', async () => {
    const res = await call('POST', {
      acceptChanges: [{ studentId: STUDENT_1, fields: ['upcomingIepDate'] }],
    });
    expect(res.status).toBe(200);

    // The plan is passed through whole; the route hands over no values of its own.
    const [args] = mockAccept.mock.calls[0] as [{ plan: unknown; requests: unknown }];
    expect(args.requests).toEqual([{ studentId: STUDENT_1, fields: ['upcomingIepDate'] }]);
    expect((args.plan as { counts: unknown }).counts).toMatchObject({ fills: 1 });
    expect(await res.json()).toMatchObject({ updatedFields: 1 });
  });

  it('reports an initials collision as its own outcome, not as a lost race', async () => {
    // Telling a provider "someone else got there first" about a deterministic
    // name clash sends them looking for a race that never happened.
    mockClaim.mockResolvedValue([
      { childId: CHILD_A, studentId: null, outcome: 'duplicate-initials' },
    ]);
    const res = await call('POST', { claimChildIds: [CHILD_A] });

    expect(await res.json()).toMatchObject({
      claimed: 0,
      duplicateInitials: 1,
      takenBySomeoneElse: 0,
    });
  });

  it('reports a student who left the school as its own outcome, not as a lost race', async () => {
    // "Someone else picked them up" would send the provider looking for a
    // colleague who never took anyone. Nobody has this student; they are simply
    // no longer on the roster at a school this caller works at.
    mockClaim.mockResolvedValue([{ childId: CHILD_A, studentId: null, outcome: 'out-of-scope' }]);
    const res = await call('POST', { claimChildIds: [CHILD_A] });

    expect(await res.json()).toMatchObject({
      claimed: 0,
      outOfScope: 1,
      takenBySomeoneElse: 0,
      duplicateInitials: 0,
    });
  });

  it('reports fields it could not apply, rather than letting them pass as saved', async () => {
    // The provider ticked these, so silence reads as "saved". It was not.
    mockAccept.mockResolvedValue({ applied: 1, skipped: 2 });
    const res = await call('POST', {
      acceptChanges: [{ studentId: STUDENT_1, fields: ['upcomingIepDate'] }],
    });

    expect(await res.json()).toMatchObject({ updatedFields: 1, skippedFields: 2 });
  });

  it('refuses a non-provider before touching anything', async () => {
    currentRole = 'teacher';
    const res = await call('POST', { claimChildIds: [CHILD_A] });

    expect(res.status).toBe(403);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('rejects a request that selects nothing', async () => {
    const res = await call('POST', {});
    expect(res.status).toBe(400);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('rejects a field name it does not offer', async () => {
    // 'iepGoals' used to be the example here; SPE-575 made it a real field.
    const res = await call('POST', {
      acceptChanges: [{ studentId: STUDENT_1, fields: ['schoolId'] }],
    });
    expect(res.status).toBe(400);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('does not claim "nothing was changed" when updates fail after a claim landed', async () => {
    mockAccept.mockRejectedValue(new Error('boom'));
    const res = await call('POST', {
      claimChildIds: [CHILD_A],
      acceptChanges: [{ studentId: STUDENT_1, fields: ['upcomingIepDate'] }],
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/shows what actually changed/);
    expect(body.error).not.toMatch(/nothing was changed/i);
    expect(body.claimed).toBe(1);
  });
});

describe('POST — district data rides along on a claim (SPE-575)', () => {
  it('enriches the claimed rows from the recomputed plan, never the request', async () => {
    const res = await call('POST', { claimChildIds: [CHILD_A] });
    expect(res.status).toBe(200);

    expect(mockEnrich).toHaveBeenCalledTimes(1);
    const [args] = mockEnrich.mock.calls[0] as [
      { plan: { claimable: Array<{ childId: string }> }; claims: unknown },
    ];
    // The plan handed over is the server's own recomputation with the offer
    // for the claimed child inside it — the request contributed only the id.
    expect(args.plan.claimable.some((c) => c.childId === CHILD_A)).toBe(true);
    expect(args.claims).toEqual([{ childId: CHILD_A, studentId: 'new-stu', outcome: 'claimed' }]);
  });

  it('reports enrichment misses so the provider knows to look at the banner again', async () => {
    mockEnrich.mockResolvedValue({ enriched: 0, enrichFailures: 1 });
    const res = await call('POST', { claimChildIds: [CHILD_A] });
    expect(await res.json()).toMatchObject({ claimed: 1, enrichFailures: 1 });
  });
});
