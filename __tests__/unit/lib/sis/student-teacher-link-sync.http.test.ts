/**
 * SPE-540 · `loadLinkSyncInput` against a REAL HTTP server.
 *
 * Three properties earn the suite (same trio as the teacher-sync twin):
 *
 * 1. FULL PAGINATION, both directions. A missed SIS page reads as "these
 *    classes lost their teachers" and PLANS REMOVALS; a capped database read
 *    hides caseload rows. The fixture serves 1000 + 1 students and 1500
 *    caseload rows and the test counts every one landed.
 * 2. THE PICK IS THE CONTRACT. Planted demographic fields on feed rows must
 *    not survive into the planner input or the plan built from it.
 * 3. LOGS ARE COUNTS ONLY. Nothing a fixture row carries — initials,
 *    district numbers, names — may appear in anything the module logs.
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

const logCalls: unknown[][] = [];
jest.mock('@/lib/logger', () => {
  const record = (...args: unknown[]) => {
    logCalls.push(args);
  };
  const fake = { info: record, warn: record, error: record, debug: record, child: () => fake };
  return { logger: fake };
});

const mockAssertSafe = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/sis/ssrf-guard', () => ({
  ...jest.requireActual('@/lib/sis/ssrf-guard'),
  assertSafeSisUrl: (...args: unknown[]) => mockAssertSafe(...(args as [string, unknown])),
}));

// The database half of the input. Chains mimic the loader's exact call
// shapes, including `.range()` slicing so the page-to-completion loops are
// exercised for real.
const mockDb = {
  schools: [{ id: 'sch-1', name: 'Rodeo Vista Elementary' }],
  students: [
    { id: 'row-1', child_id: 'child-1', district_student_id: 'DS-100' },
  ] as { id: string; child_id: string; district_student_id: string | null }[],
  children: [
    {
      id: 'child-1',
      school_id: 'sch-1',
      initials: 'AB',
      grade_level: '3',
      district_student_id: 'DS-100',
    },
  ],
  teachers: [{ id: 'tch-row-1', school_id: 'sch-1', sis_id: 'sis-tch-1' }],
  links: [
    {
      id: 'link-h',
      child_id: 'child-1',
      teacher_id: 'tch-row-9',
      subject: null,
      period: null,
      source: 'human',
    },
  ],
};
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'schools') {
        return {
          select: () => ({ eq: async () => ({ data: mockDb.schools, error: null }) }),
        };
      }
      if (table === 'students') {
        return {
          select: () => ({
            in: () => ({
              not: () => ({
                order: () => ({
                  range: async (from: number, to: number) => ({
                    data: mockDb.students.slice(from, to + 1),
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'children') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: mockDb.children.filter((c) => ids.includes(c.id)),
              error: null,
            }),
          }),
        };
      }
      if (table === 'teachers') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                not: () => ({
                  order: () => ({
                    range: async (from: number, to: number) => ({
                      data: mockDb.teachers.slice(from, to + 1),
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'student_teachers') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: mockDb.links.filter((l) => ids.includes(l.child_id)),
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import {
  loadLinkSyncInput,
  planStudentTeacherLinkSync,
} from '@/lib/sis/student-teacher-link-sync';
import { ONEROSTER_DEFAULT_PAGE_SIZE } from '@/lib/integrations/oneroster';

const CLIENT_ID = 'link-consumer-id';
const CLIENT_SECRET = 'link-consumer-secret';

const PLANTED = {
  password: 'planted-password-hash',
  birthDate: 'planted-birth-date',
  sex: 'planted-sex-value',
  phone: 'planted-phone-number',
};

/** Page one of /students: a full page of anonymous filler rows. */
function fillerStudents(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    sourcedId: `fill-${String(i).padStart(4, '0')}`,
    identifier: `FILL-${i}`,
    givenName: 'FILLER',
    familyName: `STUDENT${i}`,
    // Demographics the pick must drop, planted on row 0.
    ...(i === 0 ? PLANTED : {}),
  }));
}

let server: Server;
let origin: string;
let requests: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '';
    requests.push(url);
    const respond = (body: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.includes('/token')) return respond({ access_token: 'link-bearer' });
    if (url.includes('/students')) {
      const params = new URL(url, origin).searchParams;
      const offset = Number(params.get('offset') ?? '0');
      const limit = Number(params.get('limit') ?? '1000');
      if (offset === 0) return respond({ users: fillerStudents(limit) });
      return respond({
        users: [
          {
            sourcedId: 'sis-stu-real',
            identifier: ' DS-100 ',
            givenName: 'JAMIE',
            familyName: 'CASELOAD',
          },
          {
            sourcedId: 'sis-stu-gone',
            identifier: 'DS-999',
            status: 'tobedeleted',
          },
        ],
      });
    }
    if (url.includes('/enrollments')) {
      return respond({
        enrollments: [
          { sourcedId: 'e1', role: 'student', user: { sourcedId: 'sis-stu-real' }, class: { sourcedId: 'cls-1' } },
          { sourcedId: 'e2', role: 'teacher', user: { sourcedId: 'sis-tch-1' }, class: { sourcedId: 'cls-1' } },
          // Admin-role and tobedeleted rows must both vanish in the pick.
          { sourcedId: 'e3', role: 'administrator', user: { sourcedId: 'adm-1' }, class: { sourcedId: 'cls-1' } },
          {
            sourcedId: 'e4',
            role: 'teacher',
            user: { sourcedId: 'sis-tch-2' },
            class: { sourcedId: 'cls-1' },
            status: 'tobedeleted',
          },
          // An edge into the dead class below — survives the pick, and the
          // PLANNER counts it stale.
          { sourcedId: 'e5', role: 'student', user: { sourcedId: 'sis-stu-real' }, class: { sourcedId: 'cls-dead' } },
        ],
      });
    }
    if (url.includes('/classes')) {
      return respond({
        classes: [
          { sourcedId: 'cls-1', title: '  Room 12 ', periods: ['1', ' '], ...PLANTED },
          { sourcedId: 'cls-dead', title: 'Closed Section', status: 'tobedeleted' },
        ],
      });
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({}));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  logCalls.length = 0;
  mockAssertSafe.mockClear().mockResolvedValue(undefined);
});

const load = () =>
  loadLinkSyncInput({
    districtId: 'district-1',
    baseUrl: origin,
    tokenUrl: `${origin}/token`,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  });

describe('loadLinkSyncInput', () => {
  it('walks all three collections to completion and the spine holds end to end', async () => {
    const input = await load();

    // Students: a full page + the real row; the tobedeleted row is dropped.
    expect(input.feedStudents).toHaveLength(ONEROSTER_DEFAULT_PAGE_SIZE + 1);
    expect(requests.filter((u) => u.includes('/students')).length).toBe(2);

    // The pick kept both roles, dropped the admin and tobedeleted rows, and
    // trimmed the identifier for the exact-match spine.
    expect(input.feedEnrollments).toEqual([
      { userSourcedId: 'sis-stu-real', classSourcedId: 'cls-1', role: 'student' },
      { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
      { userSourcedId: 'sis-stu-real', classSourcedId: 'cls-dead', role: 'student' },
    ]);
    expect(input.feedStudents.find((s) => s.sourcedId === 'sis-stu-real')?.identifier).toBe(
      'DS-100',
    );

    // Classes: the dead section is dropped, labels arrive trimmed.
    expect(input.feedClasses).toEqual([
      { sourcedId: 'cls-1', title: 'Room 12', periods: ['1'] },
    ]);

    // End to end: the plan links the caseload child to the teacher row, the
    // dead-class edge counts stale, and the human link is counted kept.
    const plan = planStudentTeacherLinkSync(input);
    const school = plan.schools[0];
    expect(school.adds).toEqual([
      { childId: 'child-1', teacherId: 'tch-row-1', subject: 'Room 12', period: '1' },
    ]);
    expect(school.humanLinksKept).toBe(1);
    expect(plan.staleEnrollments).toBe(1);
  });

  it('drops planted demographic fields — and the whole pipeline stays clean of them', async () => {
    const input = await load();
    const serialized = JSON.stringify(input);
    for (const value of Object.values(PLANTED)) {
      expect(serialized).not.toContain(value);
    }
    const planSerialized = JSON.stringify(planStudentTeacherLinkSync(input));
    for (const value of Object.values(PLANTED)) {
      expect(planSerialized).not.toContain(value);
    }
  });

  it('reads caseload rows past the 1000-row PostgREST cap', async () => {
    // 1500 caseload rows: an unpaginated read would return 1000 and quietly
    // shrink the base set the diff runs over.
    mockDb.students = Array.from({ length: 1500 }, (_, i) => ({
      id: `row-${String(i).padStart(4, '0')}`,
      child_id: `child-${String(i).padStart(4, '0')}`,
      district_student_id: null,
    }));
    try {
      const input = await load();
      expect(input.caseloadRows).toHaveLength(1500);
    } finally {
      mockDb.students = [{ id: 'row-1', child_id: 'child-1', district_student_id: 'DS-100' }];
    }
  });

  it('logs nothing a fixture row carries — no initials, numbers, or names', async () => {
    await load();
    const logged = JSON.stringify(logCalls);
    // Non-vacuous: the load path DOES log (the client's token-granted line).
    expect(logCalls.length).toBeGreaterThan(0);
    for (const value of [
      'DS-100',
      'AB',
      'JAMIE',
      'CASELOAD',
      'child-1',
      CLIENT_SECRET,
      ...Object.values(PLANTED),
    ]) {
      expect(logged).not.toContain(value);
    }
  });

  it('checks both URLs with the SSRF guard and dials NOTHING when it refuses', async () => {
    mockAssertSafe.mockRejectedValue(new Error('refused'));
    await expect(load()).rejects.toThrow('refused');
    expect(requests).toHaveLength(0);
  });

  it('calls the guard on the base and token addresses', async () => {
    await load();
    const checked = mockAssertSafe.mock.calls.map((c) => c[0]);
    expect(checked).toContain(origin);
    expect(checked).toContain(`${origin}/token`);
  });
});
