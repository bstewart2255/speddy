/**
 * SPE-436 · the directory fetch against a REAL HTTP server, and the property
 * that earns the suite: THE PICK IS THE CONTRACT. The fixtures deliberately
 * carry fields a district admin must never see in this surface — demographics,
 * credential-looking strings, vendor extras — and the tests assert they cannot
 * survive into a page, however the vendor payload is shaped.
 *
 * The SSRF guard is stubbed (127.0.0.1 over http is exactly what it refuses);
 * oneroster-directory.test.ts covers that the module CALLS the real one.
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

jest.mock('@/lib/sis/ssrf-guard', () => ({
  ...jest.requireActual('@/lib/sis/ssrf-guard'),
  assertSafeSisUrl: jest.fn().mockResolvedValue(undefined),
}));

import { fetchDirectoryPage, DIRECTORY_PAGE_SIZE } from '@/lib/sis/oneroster-directory';

const CLIENT_ID = 'dir-consumer-id';
const CLIENT_SECRET = 'dir-consumer-secret';
const TOKEN = 'dir-bearer-token';

// Planted values that must never appear in any page this module returns.
const PLANTED = {
  birthDate: '2015-03-14',
  sex: 'female',
  race: 'planted-race-value',
  password: 'planted-password-hash',
  vendorExtra: 'planted-vendor-blob',
};

let server: Server;
let origin: string;
let handler: (url: string) => { status: number; body: unknown };

beforeAll(async () => {
  server = createServer((req, res) => {
    const { status, body } = handler(req.url ?? '');
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const SCHOOLS = {
  orgs: [
    { sourcedId: 'sch-1', name: 'Rodeo Hills Elementary', identifier: '0001', type: 'school' },
    { sourcedId: 'sch-2', name: 'Crockett Middle', identifier: '0002', type: 'school' },
  ],
};

const baseHandler = (url: string): { status: number; body: unknown } => {
  if (url.includes('/token')) return { status: 200, body: { access_token: TOKEN } };
  if (url.includes('/schools')) return { status: 200, body: SCHOOLS };
  if (url.includes('/teachers')) {
    return {
      status: 200,
      body: {
        users: [
          {
            sourcedId: 't-1',
            givenName: 'Dana',
            familyName: 'Alvarez',
            email: 'dalvarez@example.org',
            identifier: 'STAFF-9',
            grades: ['03'],
            orgs: [{ sourcedId: 'sch-1' }],
            password: PLANTED.password,
            vendorExtra: PLANTED.vendorExtra,
          },
          { sourcedId: 't-2', familyName: 'Okafor', orgs: [{ sourcedId: 'sch-2' }] },
          // Neither name field — the placeholder branch (CodeRabbit, PR #830).
          { sourcedId: 't-3', orgs: [] },
        ],
      },
    };
  }
  if (url.includes('/students')) {
    return {
      status: 200,
      body: {
        users: [
          {
            sourcedId: 's-1',
            givenName: 'Sam',
            familyName: 'Nguyen',
            identifier: '123456',
            grades: ['05'],
            orgs: [{ sourcedId: 'sch-1' }],
            // The line this surface must never cross, even if a server
            // volunteers it despite the no-demographics scope.
            birthDate: PLANTED.birthDate,
            sex: PLANTED.sex,
            race: PLANTED.race,
          },
        ],
      },
    };
  }
  if (url.includes('/classes')) {
    return {
      status: 200,
      body: {
        classes: [
          {
            sourcedId: 'c-1',
            title: 'Room 12',
            classType: 'homeroom',
            subjects: ['ELA'],
            periods: ['1'],
            grades: ['03'],
          },
          { sourcedId: 'c-2', title: 'Period 3 English', classType: 'scheduled', subjects: [] },
        ],
      },
    };
  }
  return { status: 404, body: {} };
};

beforeEach(() => {
  handler = baseHandler;
});

const fetchArea = (area: 'teachers' | 'students' | 'classes' | 'schools', offset = 0) =>
  fetchDirectoryPage({
    baseUrl: `${origin}/admin`,
    tokenUrl: `${origin}/admin/token`,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    area,
    offset,
  });

describe('the pick is the contract', () => {
  it('teachers: picked fields arrive, planted vendor fields cannot', async () => {
    const page = await fetchArea('teachers');

    expect(page.rows).toHaveLength(3);
    expect(page.rows[0]).toEqual({
      sourcedId: 't-1',
      name: 'Dana Alvarez',
      email: 'dalvarez@example.org',
      identifier: 'STAFF-9',
      grades: ['03'],
      schools: ['Rodeo Hills Elementary'],
    });

    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(PLANTED.password);
    expect(serialized).not.toContain(PLANTED.vendorExtra);
  });

  it('students: demographics a server volunteers are structurally unrepresentable', async () => {
    // The scope never asks for demographics, but the pick is what GUARANTEES
    // they cannot reach a browser even from a server that sends them anyway.
    const page = await fetchArea('students');

    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(PLANTED.birthDate);
    expect(serialized).not.toContain(PLANTED.sex);
    expect(serialized).not.toContain(PLANTED.race);
    expect(serialized).toContain('123456');
    expect(serialized).toContain('Sam Nguyen');
  });

  it('a teacher with no name renders a placeholder, not undefined-undefined', async () => {
    const page = await fetchArea('teachers');
    const second = page.rows[1] as { name: string; schools: string[] };
    expect(second.name).toBe('Okafor');
    expect(second.schools).toEqual(['Crockett Middle']);
    expect((page.rows[2] as { name: string }).name).toBe('(no name given)');
  });
});

describe('the owner check numbers', () => {
  it('teachers: coverage stats count what the page shows, numerically', async () => {
    // Numeric (n / of) rather than pre-formatted strings, so the client can
    // sum stats across appended pages instead of showing the last page's
    // counts over an accumulated table (self-review, PR: stats drift).
    const page = await fetchArea('teachers');
    const byLabel = Object.fromEntries(page.stats.map((s) => [s.label, s]));

    expect(byLabel['Teachers listed']).toMatchObject({ n: 3 });
    expect(byLabel['with an email']).toMatchObject({ n: 1, of: 3 });
    expect(byLabel['with a staff ID']).toMatchObject({ n: 1, of: 3 });
    expect(byLabel['with a grade level']).toMatchObject({ n: 1, of: 3 });
  });

  it('classes: the homeroom/scheduled split is the elementary detector', async () => {
    const page = await fetchArea('classes');
    const byLabel = Object.fromEntries(page.stats.map((s) => [s.label, s]));

    expect(byLabel['Classes listed']).toMatchObject({ n: 2 });
    expect(byLabel['homeroom']).toMatchObject({ n: 1 });
    expect(byLabel['scheduled']).toMatchObject({ n: 1 });
    expect(byLabel['untyped']).toMatchObject({ n: 0 });
    expect(byLabel['with a subject']).toMatchObject({ n: 1, of: 2 });
  });

  it('a full page is flagged so counts read as page counts, not district counts', async () => {
    handler = (url) => {
      if (url.includes('/token')) return { status: 200, body: { access_token: TOKEN } };
      if (url.includes('/schools')) {
        return {
          status: 200,
          body: {
            orgs: Array.from({ length: DIRECTORY_PAGE_SIZE }, (_, i) => ({
              sourcedId: `sch-${i}`,
              name: `School ${i}`,
            })),
          },
        };
      }
      return { status: 404, body: {} };
    };

    const page = await fetchArea('schools');
    expect(page.rows).toHaveLength(DIRECTORY_PAGE_SIZE);
    expect(page.pageFull).toBe(true);
  });
});

describe('the school-name map', () => {
  it('follows a FULL schools page so big districts keep their names', async () => {
    // A first page that comes back full may be truncation. A person whose
    // school fell off the map would render an empty School column —
    // indistinguishable from the SIS not linking them (self-review).
    handler = (url) => {
      if (url.includes('/token')) return { status: 200, body: { access_token: TOKEN } };
      if (url.includes('/schools')) {
        const offset = Number(new URL(`http://x${url}`).searchParams.get('offset') ?? '0');
        if (offset === 0) {
          return {
            status: 200,
            body: {
              orgs: Array.from({ length: DIRECTORY_PAGE_SIZE }, (_, i) => ({
                sourcedId: `sch-${i}`,
                name: `School ${i}`,
              })),
            },
          };
        }
        return { status: 200, body: { orgs: [{ sourcedId: 'sch-tail', name: 'Tail School' }] } };
      }
      if (url.includes('/teachers')) {
        return {
          status: 200,
          body: { users: [{ sourcedId: 't-1', familyName: 'Tail', orgs: [{ sourcedId: 'sch-tail' }] }] },
        };
      }
      return { status: 404, body: {} };
    };

    const page = await fetchArea('teachers');
    expect((page.rows[0] as { schools: string[] }).schools).toEqual(['Tail School']);
  });
});

describe('degradation', () => {
  it('a broken /schools read leaves teachers rendered with an empty school column', async () => {
    handler = (url) => {
      if (url.includes('/schools')) return { status: 500, body: {} };
      return baseHandler(url);
    };

    const page = await fetchArea('teachers');
    expect(page.rows).toHaveLength(3);
    expect((page.rows[0] as { schools: string[] }).schools).toEqual([]);
  });

  it('an unreachable area throws — the route turns that into "run the test"', async () => {
    handler = (url) => {
      if (url.includes('/teachers')) return { status: 500, body: {} };
      return baseHandler(url);
    };

    await expect(fetchArea('teachers')).rejects.toThrow();
  });
});
