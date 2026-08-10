/**
 * SPE-437 · `loadTeacherSyncInput` against a REAL HTTP server.
 *
 * Three properties earn the suite:
 *
 * 1. FULL PAGINATION. The probe sampled first pages; a sync that missed page
 *    two would report those teachers "missing from SIS" on the next run. The
 *    fixture serves 1000 + 3 rows and the test counts 1003 landed.
 * 2. THE PICK IS THE CONTRACT. Planted credential- and demographics-looking
 *    fields on feed rows must not survive into the planner input.
 * 3. LOGS ARE COUNTS ONLY. Nothing a fixture row carries — names, emails,
 *    planted values — may appear in anything the module logs.
 *
 * The SSRF guard is stubbed (127.0.0.1 over http is exactly what it refuses);
 * a separate case pins that the module CALLS it and stops when it throws.
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

// The database half of the input: schools, existing teachers, student counts.
const mockDb = {
  schools: [
    { id: 'sch-elem', name: 'Rodeo Vista Elementary' },
    { id: 'sch-high', name: 'Crockett Point High' },
  ],
  teachers: [] as unknown[],
  studentCounts: { 'sch-elem': 3, 'sch-high': 2 } as Record<string, number>,
};
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'schools') {
        return {
          select: () => ({ eq: async () => ({ data: mockDb.schools, error: null }) }),
        };
      }
      if (table === 'teachers') {
        return {
          select: () => ({ in: async () => ({ data: mockDb.teachers, error: null }) }),
        };
      }
      if (table === 'students') {
        return {
          select: () => ({
            eq: async (_col: string, id: string) => ({
              count: mockDb.studentCounts[id] ?? 0,
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
  loadTeacherSyncInput,
  planTeacherDirectorySync,
} from '@/lib/sis/teacher-directory-sync';

const CLIENT_ID = 'sync-consumer-id';
const CLIENT_SECRET = 'sync-consumer-secret';

const PLANTED = {
  password: 'planted-password-hash',
  birthDate: 'planted-birth-date',
  sex: 'planted-sex-value',
  vendorExtra: 'planted-vendor-blob',
};

/** Page one of /teachers: a full page of anonymous filler rows. */
function fillerTeachers(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    sourcedId: `fill-${String(i).padStart(4, '0')}`,
    givenName: 'FILLER',
    familyName: `ROW${i}`,
    email: `filler${i}@example.org`,
    identifier: `11_TCH_${9000 + i}`,
    grades: ['03'],
    orgs: [{ sourcedId: 'org-elem' }],
    // Vendor extras and demographics the pick must drop, planted on row 0.
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

    if (url.includes('/token')) return respond({ access_token: 'sync-bearer' });
    if (url.includes('/schools')) {
      return respond({
        orgs: [
          { sourcedId: 'org-elem', name: 'Rodeo Vista Elementary School' },
          { sourcedId: 'org-high', name: 'Crockett Point High School' },
          { sourcedId: 'org-closed', name: 'Closed Annex', status: 'tobedeleted' },
        ],
      });
    }
    if (url.includes('/teachers')) {
      const offset = Number(new URL(url, origin).searchParams.get('offset') ?? '0');
      if (offset === 0) return respond({ users: fillerTeachers(1000) });
      return respond({
        users: [
          {
            sourcedId: 'real-1',
            givenName: 'DANA',
            familyName: 'WHITFIELD',
            email: 'dwhitfield@example.org',
            identifier: '22_TCH_777',
            grades: ['09', '10'],
            orgs: [{ sourcedId: 'org-high' }],
          },
          {
            sourcedId: 'aide-1',
            givenName: 'ROBIN',
            familyName: 'OFFICESTAFF',
            email: 'rofficestaff@example.org',
            identifier: 'non-teaching staff',
            grades: ['KG'],
            orgs: [{ sourcedId: 'org-elem' }],
          },
          {
            sourcedId: 'gone-1',
            givenName: 'GONE',
            familyName: 'TEACHER',
            identifier: '22_TCH_778',
            status: 'tobedeleted',
            orgs: [{ sourcedId: 'org-high' }],
          },
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
  loadTeacherSyncInput({
    districtId: 'district-1',
    baseUrl: origin,
    tokenUrl: `${origin}/token`,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  });

describe('loadTeacherSyncInput', () => {
  it('walks /teachers to completion — 1003 rows across two pages, minus the dropped', async () => {
    const input = await load();

    // 1000 filler + real + sentinel; the tobedeleted row is dropped.
    expect(input.feedTeachers).toHaveLength(1002);
    const teacherPages = requests.filter((u) => u.includes('/teachers'));
    expect(teacherPages.length).toBe(2);

    // The pick carried what the planner needs…
    const real = input.feedTeachers.find((t) => t.sourcedId === 'real-1');
    expect(real).toMatchObject({
      firstName: 'DANA',
      lastName: 'WHITFIELD',
      identifier: '22_TCH_777',
      isTeacher: true,
      orgIds: ['org-high'],
    });
    const aide = input.feedTeachers.find((t) => t.sourcedId === 'aide-1');
    expect(aide?.isTeacher).toBe(false);

    // …schools dropped the tobedeleted org…
    expect(input.feedSchools.map((s) => s.sourcedId).sort()).toEqual(['org-elem', 'org-high']);

    // …and the database half arrived keyed by school id.
    expect(input.studentCounts).toEqual({ 'sch-elem': 3, 'sch-high': 2 });
  });

  it('drops planted vendor/demographic fields — and the whole pipeline stays clean of them', async () => {
    const input = await load();
    const serialized = JSON.stringify(input);
    for (const value of Object.values(PLANTED)) {
      expect(serialized).not.toContain(value);
    }

    // End-to-end: the plan built from this input is equally clean.
    const plan = planTeacherDirectorySync(input);
    const planSerialized = JSON.stringify(plan);
    for (const value of Object.values(PLANTED)) {
      expect(planSerialized).not.toContain(value);
    }
  });

  it('logs nothing a fixture row carries — no names, emails, or planted values', async () => {
    await load();
    const logged = JSON.stringify(logCalls);
    for (const value of [
      'WHITFIELD',
      'OFFICESTAFF',
      'dwhitfield@example.org',
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
