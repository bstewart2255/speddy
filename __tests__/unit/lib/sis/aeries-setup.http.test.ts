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
 * The guard is stubbed because these servers are on 127.0.0.1 over plain http,
 * both of which it correctly refuses. That is the point of stubbing the whole
 * of `assertSafeSisUrl` rather than half of it: this suite is about
 * transport, and URL policy is proven elsewhere — ssrf-guard.test.ts for the
 * classification, aeries-setup.guard-wiring.test.ts for the fact that
 * runAeriesConnectionTest actually calls the guard and refuses an http:// base.
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

jest.mock('@/lib/sis/ssrf-guard', () => ({
  ...jest.requireActual('@/lib/sis/ssrf-guard'),
  assertSafeSisUrl: jest.fn().mockResolvedValue(undefined),
}));

import { runAeriesConnectionTest } from '@/lib/sis/aeries-setup';

const CERT = '477abe9e7d27439681d62f4e0de1f5e1';

/** Route table keyed by the path segment the probe hits. */
type Handler = (path: string) => {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Send `body` verbatim as text/html instead of JSON-encoding it.
   *
   * Needed because a wrong path on a district's own web server answers with a
   * real HTML page, and `JSON.stringify('<html>…')` is still valid JSON — so a
   * test written without this proves nothing about the case it claims to cover.
   */
  raw?: boolean;
};

let server: Server;
let baseUrl: string;
let handler: Handler;
let seenCertHeaders: (string | undefined)[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seenCertHeaders.push(req.headers['aeries-cert'] as string | undefined);
    const { status, body, headers, raw } = handler(req.url ?? '');
    res.writeHead(status, {
      'Content-Type': raw ? 'text/html' : 'application/json',
      ...(headers ?? {}),
    });
    res.end(body === undefined ? '' : raw ? String(body) : JSON.stringify(body));
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

describe('resolving the API root when the stored one is wrong (SPE-426)', () => {
  /**
   * The JSUSD shape: the district is on an Aeries-HOSTED api host, where the
   * API lives at /api/v5, but we stored the self-hosted default /aeries/api/v5.
   * Their server answered every probe with 404 and the form gave them no way to
   * correct it, so resolution has to do it for them.
   */
  const hostedOnly: Handler = (path) => {
    if (path.startsWith('/aeries/api/v5')) return { status: 404, body: { message: 'not found' } };
    if (path.includes('/programs')) return { status: 200, body: [{ ProgramCode: '144' }] };
    if (path.includes('/teachers')) return { status: 200, body: [{ TeacherNumber: 7 }] };
    if (path.includes('/students')) return { status: 200, body: [{ StudentID: 1 }] };
    if (path.startsWith('/api/v5')) return { status: 200, body: [{ SchoolCode: 1, Name: 'Sim High' }] };
    return { status: 404, body: { message: 'not found' } };
  };

  it('finds the working root when the stored one 404s, and names it in the report', async () => {
    handler = hostedOnly;
    const report = await run();

    expect(report.ok).toBe(true);
    const hosted = baseUrl.replace('/aeries/api/v5', '/api/v5');
    expect(report.usedBaseUrl).toBe(hosted);
    // Surfaced to the district too. Being told the connection is fine about an
    // address they cannot find in their own settings is its own confusion.
    expect(area(report, 'connection').message).toContain(hosted);
  });

  it('reports nothing extra when the stored root already works', async () => {
    handler = allGranted;
    const report = await run();

    expect(report.ok).toBe(true);
    // Absent, not equal-to-stored — the field means "we had to look elsewhere",
    // so a caller cannot mistake a normal pass for a discovery.
    expect(report.usedBaseUrl).toBeUndefined();
    expect(area(report, 'connection').message).toBe('Speddy can reach your Aeries instance.');
  });

  it('does not treat a trailing slash on the stored address as a different root', async () => {
    // The stored value and the candidate differ only by punctuation. Reporting
    // that as "we found another address" would put a meaningless correction in
    // front of a district whose configuration is already right.
    handler = allGranted;
    const report = await runAeriesConnectionTest({ baseUrl: `${baseUrl}/`, certificate: CERT });

    expect(report.ok).toBe(true);
    expect(report.usedBaseUrl).toBeUndefined();
  });

  it('keeps looking when the stored root answers 200 with a real HTML page', async () => {
    // The commonest wrong-path shape after a 404, and the one a status-code-only
    // check misses: a district web server that serves its login page for any
    // path its API does not handle. Indistinguishable from a working endpoint by
    // status alone, and just as wrong.
    //
    // `raw` matters. Served as JSON this is a valid JSON string and the
    // non-array branch catches it; served as real text/html the JSON parse
    // THROWS, which is a completely different path through the client and the
    // one a district actually hits. The first version of this test used the
    // JSON encoding and passed against code that had the real gap.
    handler = (path) =>
      path.startsWith('/aeries/api/v5')
        ? { status: 200, body: '<!doctype html><html><body>Sign in</body></html>', raw: true }
        : allGranted(path);

    const report = await run();

    expect(report.ok).toBe(true);
    expect(report.usedBaseUrl).toBe(baseUrl.replace('/aeries/api/v5', '/api/v5'));
  });

  it('keeps looking when the stored root answers 200 with JSON that is not a list', async () => {
    handler = (path) =>
      path.startsWith('/aeries/api/v5')
        ? { status: 200, body: { error: 'not the API' } }
        : allGranted(path);

    const report = await run();

    expect(report.ok).toBe(true);
    expect(report.usedBaseUrl).toBe(baseUrl.replace('/aeries/api/v5', '/api/v5'));
  });

  it('says the host ANSWERED when every root serves HTML, not that it is unreachable', async () => {
    // The two failures need opposite fixes: "we could not reach you" sends a
    // district to their firewall, when in fact their server replied and the
    // address is wrong. Getting this backwards is what SPE-419 is about.
    handler = () => ({ status: 200, body: '<html>Sign in</html>', raw: true });

    const report = await run();

    expect(report.ok).toBe(false);
    expect(area(report, 'connection').message).toMatch(/answered, but not with Aeries data/i);
    expect(area(report, 'connection').message).not.toMatch(/could not reach/i);
  });

  it('STOPS at a 401 instead of walking on to another root', async () => {
    // The load-bearing case. A 401 means the endpoint EXISTS and refused the
    // certificate. If resolution treated that as "wrong address" it would move
    // on, and the district would be told to fix an address that was correct
    // while the real problem — their certificate — went unmentioned. That is
    // the SPE-417 misdiagnosis shape, which this whole ticket exists to stop.
    handler = (path) =>
      path.startsWith('/aeries/api/v5')
        ? { status: 401, body: { message: 'bad cert' } }
        : { status: 200, body: [{ SchoolCode: 1, Name: 'Sim High' }] };

    const report = await run();

    expect(report.ok).toBe(false);
    expect(report.usedBaseUrl).toBeUndefined();
    expect(area(report, 'connection').message).toMatch(/re-copy it/i);
    expect(area(report, 'connection').message).not.toMatch(/address/i);
  });

  it('STOPS at a 403 instead of walking on to another root', async () => {
    // Same reasoning: 403 means the endpoint exists and a permission box is
    // unticked. Walking past it would hide the checkbox they need to tick.
    handler = (path) =>
      path.startsWith('/aeries/api/v5')
        ? { status: 403, body: { message: 'forbidden' } }
        : { status: 200, body: [{ SchoolCode: 1, Name: 'Sim High' }] };

    const report = await run();

    expect(report.ok).toBe(false);
    expect(report.usedBaseUrl).toBeUndefined();
    expect(area(report, 'schools').status).toBe('denied');
  });

  it('reports a 404 honestly when no known layout answers', async () => {
    // Nothing to correct: say the address did not work rather than inventing a
    // root, and leave the stored value alone.
    handler = () => ({ status: 404, body: { message: 'not found' } });

    const report = await run();

    expect(report.ok).toBe(false);
    expect(report.usedBaseUrl).toBeUndefined();
    expect(report.summary).toMatch(/could not connect/i);
  });
});

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
