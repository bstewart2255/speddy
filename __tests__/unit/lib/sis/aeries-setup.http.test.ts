/**
 * SPE-396 · the Aeries diagnostics against a REAL HTTP server.
 *
 * The sibling suite mocks `AeriesClient`'s methods, so it proves the reporting
 * logic and nothing about the transport. This one starts an actual server and
 * lets the real `fetch` in `AeriesClient` talk to it, so what is exercised is
 * the whole path: request construction, real HTTP status codes, real JSON
 * parsing, `AeriesApiError` mapping, and the redirect policy.
 *
 * WHY THIS EXISTS. `demo.aeries.net` is blocked by this sandbox's egress policy,
 * so the flow has never run against a real Aeries instance. This closes most of
 * that gap — everything except Aeries' own behaviour. Stated precisely:
 *
 *   - PROVEN HERE: given a 403, our code says "tick that box"; given a 401, it
 *     says "re-copy the certificate"; a redirect is refused; a non-array body
 *     is not reported as a network failure.
 *   - STILL ASSUMED: that Aeries actually returns 403 for an unticked
 *     permission area rather than 401, or a 200 with an empty array. No mock
 *     can settle that; only the real service can.
 *
 * The guard is stubbed because these servers are on 127.0.0.1, which it
 * correctly refuses. ssrf-guard.test.ts covers the guard itself.
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

jest.mock('@/lib/sis/ssrf-guard', () => ({
  ...jest.requireActual('@/lib/sis/ssrf-guard'),
  assertPublicAeriesHost: jest.fn().mockResolvedValue(undefined),
}));

import { runAeriesConnectionTest } from '@/lib/sis/aeries-setup';

const CERT = '477abe9e7d27439681d62f4e0de1f5e1';

/** Route table keyed by the path segment the probe hits. */
type Handler = (path: string) => { status: number; body?: unknown; headers?: Record<string, string> };

let server: Server;
let baseUrl: string;
let handler: Handler;
let seenCertHeaders: (string | undefined)[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seenCertHeaders.push(req.headers['aeries-cert'] as string | undefined);
    const { status, body, headers } = handler(req.url ?? '');
    res.writeHead(status, { 'Content-Type': 'application/json', ...(headers ?? {}) });
    res.end(body === undefined ? '' : JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/aeries/api/v5`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seenCertHeaders = [];
});

const run = () => runAeriesConnectionTest({ baseUrl, certificate: CERT });
const area = (r: Awaited<ReturnType<typeof run>>, key: string) => r.areas.find((a) => a.key === key)!;

/** Everything granted; each endpoint returns a plausible Aeries-shaped body. */
const allGranted: Handler = (path) => {
  if (path.includes('/programs')) return { status: 200, body: [{ ProgramCode: '144' }] };
  if (path.includes('/teachers')) return { status: 200, body: [{ TeacherNumber: 7 }] };
  if (path.includes('/students')) return { status: 200, body: [{ StudentID: 1 }] };
  return { status: 200, body: [{ SchoolCode: 1, Name: 'Sim High' }] };
};

describe('runAeriesConnectionTest over real HTTP', () => {
  it('reports every area granted, and sends the certificate as a header', async () => {
    handler = allGranted;
    const report = await run();

    expect(report.ok).toBe(true);
    expect(report.summary).toMatch(/ready/i);
    // The transport detail the mocked suite cannot see: the credential travels
    // as AERIES-CERT on every request, not in a query string where it would
    // land in the district's access logs.
    expect(seenCertHeaders.length).toBeGreaterThan(0);
    expect(new Set(seenCertHeaders)).toEqual(new Set([CERT]));
  });

  it('a real 403 on Student Programs produces "tick that box", not a cert error', async () => {
    handler = (path) =>
      path.includes('/programs') ? { status: 403, body: { message: 'forbidden' } } : allGranted(path);

    const report = await run();
    expect(report.ok).toBe(false);
    expect(area(report, 'programs').status).toBe('denied');
    expect(area(report, 'programs').message).toMatch(/read-only box/);
    expect(report.summary).toMatch(/special education/i);
  });

  it('a real 401 produces "re-copy the certificate", and stops before the other probes', async () => {
    handler = () => ({ status: 401, body: { message: 'unauthorized' } });

    const report = await run();
    expect(area(report, 'connection').message).toMatch(/certificate/i);
    // One request, not four: probing on with a certificate Aeries just rejected
    // would produce three more misleading failures.
    expect(seenCertHeaders).toHaveLength(1);
  });

  it('a real 404 blames the address rather than a permission', async () => {
    handler = () => ({ status: 404, body: { message: 'not found' } });
    const report = await run();
    expect(area(report, 'connection').message).toMatch(/address/i);
    expect(area(report, 'connection').message).not.toMatch(/read-only box/);
  });

  it('a 200 with a non-array body is not reported as unreachable', async () => {
    // The failure CodeRabbit flagged: `.map` throws a TypeError, which the
    // network branch would otherwise swallow into "could not reach Aeries" for
    // an instance that answered perfectly well.
    handler = () => ({ status: 200, body: { error: 'unexpected shape' } });
    const report = await run();
    expect(area(report, 'connection').message).not.toMatch(/Could not reach/i);
  });

  it('REFUSES a redirect instead of following it — with the certificate unsent', async () => {
    // The escape that defeated the whole SSRF guard before `redirect: 'error'`:
    // a public host answering 302 towards an internal address. This asserts the
    // policy actually takes effect in this Node runtime rather than trusting
    // that the option is honoured.
    let redirectTarget = '';
    handler = (path) => {
      if (path.includes('/elsewhere')) return { status: 200, body: [{ SchoolCode: 99 }] };
      redirectTarget = `${baseUrl}/elsewhere`;
      return { status: 302, headers: { Location: redirectTarget } };
    };

    const report = await run();
    expect(report.ok).toBe(false);
    // Exactly one request: the redirect was refused, not followed. If fetch had
    // followed it there would be a second request carrying AERIES-CERT to a
    // destination the guard never validated.
    expect(seenCertHeaders).toHaveLength(1);
    expect(area(report, 'connection').status).not.toBe('ok');
  });

  it('surfaces a dead server as unreachable, not as a permission problem', async () => {
    const report = await runAeriesConnectionTest({
      // Port 1 is reserved and nothing listens there.
      baseUrl: 'http://127.0.0.1:1/aeries/api/v5',
      certificate: CERT,
    });
    expect(area(report, 'connection').message).toMatch(/Could not reach/i);
  });
});
