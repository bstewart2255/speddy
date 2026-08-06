/**
 * SPE-397 · the OneRoster exchange against a REAL HTTP server.
 *
 * OneRoster's auth is two steps — POST credentials for a bearer token, then use
 * the token — and the properties worth the most are about WHICH credential
 * travels WHERE. A mocked client cannot see that at all: it would pass whether
 * the consumer secret went in a header, a query string, or on every subsequent
 * request. So this suite starts a real server and inspects what actually
 * arrives.
 *
 * WHY THIS MATTERS HERE MORE THAN FOR AERIES. Aeries sends one static header to
 * one host. OneRoster sends a long-lived district secret to one endpoint and a
 * short-lived token to another. Leaking the first onto the second — or into a
 * query string, where it lands in the district's own access logs — is a silent
 * credential disclosure that every mocked test in the suite would still pass.
 *
 * The guard is stubbed because these servers are on 127.0.0.1 over plain http,
 * which it correctly refuses. ssrf-guard.test.ts covers the guard itself and
 * oneroster-setup.test.ts covers that this module actually calls it.
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

jest.mock('@/lib/sis/ssrf-guard', () => ({
  ...jest.requireActual('@/lib/sis/ssrf-guard'),
  assertSafeSisUrl: jest.fn().mockResolvedValue(undefined),
}));

import { runOneRosterConnectionTest } from '@/lib/sis/oneroster-setup';

const CLIENT_ID = 'speddy-consumer-id';
const CLIENT_SECRET = 'sup3r-s3cret-consumer-key';
const TOKEN = 'bearer-token-abc123';

interface Seen {
  url: string;
  method: string;
  auth?: string;
  /** EVERY header, not just Authorization — see the secret-placement test. */
  headers: Record<string, string>;
  body: string;
}

/** Flatten a request to one string, so a secret cannot hide in a field nobody checked. */
const everything = (r: Seen) =>
  [r.url, r.body, ...Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`)].join('\n');

type Handler = (req: Seen) => { status: number; body?: unknown; headers?: Record<string, string> };

let server: Server;
let origin: string;
let handler: Handler;
let seen: Seen[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const entry: Seen = {
        url: req.url ?? '',
        method: req.method ?? '',
        auth: req.headers.authorization,
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v ?? '')]),
        ),
        body,
      };
      seen.push(entry);
      const { status, body: out, headers } = handler(entry);
      res.writeHead(status, { 'Content-Type': 'application/json', ...(headers ?? {}) });
      res.end(out === undefined ? '' : JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen = [];
});

const run = () =>
  runOneRosterConnectionTest({
    baseUrl: `${origin}/admin`,
    tokenUrl: `${origin}/admin/token/`,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  });

const stepOf = (r: Awaited<ReturnType<typeof run>>, key: string) =>
  r.steps.find((s) => s.key === key)!;

/** Everything works: a token, then both collections. */
const allGood: Handler = (req) => {
  if (req.url.includes('/token')) {
    return { status: 200, body: { access_token: TOKEN, token_type: 'bearer', expires_in: 3600 } };
  }
  return { status: 200, body: { orgs: [{ sourcedId: 'org-1', name: 'Sim USD', type: 'district' }] } };
};

describe('the OneRoster exchange over real HTTP', () => {
  it('reports every step working', async () => {
    handler = allGood;
    const report = await run();

    expect(report.ok).toBe(true);
    expect(report.summary).toMatch(/ready/i);
    expect(report.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok']);
  });

  it('sends the consumer secret ONLY to the token endpoint, and only as a Basic header', async () => {
    handler = allGood;
    await run();

    const tokenReqs = seen.filter((r) => r.url.includes('/token'));
    const dataReqs = seen.filter((r) => !r.url.includes('/token'));
    expect(tokenReqs).toHaveLength(1);
    expect(dataReqs.length).toBeGreaterThan(0);

    // The secret is in the Basic header of the token request...
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    expect(tokenReqs[0].auth).toBe(`Basic ${basic}`);

    // ...and NOWHERE else.
    //
    // Asserted over the WHOLE request — every header, the body, and the URL —
    // not just Authorization. The narrower version of this test passed while a
    // mutant leaked the secret in an `X-Secret:` header on every data request,
    // which is exactly the disclosure this test exists to catch.
    expect(tokenReqs[0].body).not.toContain(CLIENT_SECRET);
    for (const r of dataReqs) {
      expect(r.auth).toBe(`Bearer ${TOKEN}`);
      expect(everything(r)).not.toContain(CLIENT_SECRET);
      expect(everything(r)).not.toContain(CLIENT_ID);
    }
    // A URL is the worst place of all: it lands in the district's own access
    // logs and in any proxy between us and them.
    for (const r of seen) {
      expect(r.url).not.toContain(CLIENT_SECRET);
      expect(r.url).not.toContain(CLIENT_ID);
    }
  });

  it('form-encodes each credential before building the Basic header (RFC 6749 §2.3.1)', async () => {
    // Raised by Codex. Basic auth splits on the FIRST colon, so a consumer ID
    // containing one produces a credential the token endpoint cannot parse
    // back — and this route deliberately accepts any credential shape, because
    // vendors differ and there is nothing safe to validate against.
    handler = allGood;
    await runOneRosterConnectionTest({
      baseUrl: `${origin}/admin`,
      tokenUrl: `${origin}/admin/token/`,
      clientId: 'id:with:colons',
      clientSecret: 'se%cret with spaces',
    });

    const decoded = Buffer.from(
      seen[0].auth!.replace(/^Basic /, ''),
      'base64',
    ).toString('utf8');

    // Exactly one colon survives — the separator. The ones inside the id are
    // encoded, so the server can split and decode back to the real values.
    expect(decoded.split(':')).toHaveLength(2);
    const [user, pass] = decoded.split(':');
    expect(decodeURIComponent(user)).toBe('id:with:colons');
    expect(decodeURIComponent(pass.replace(/\+/g, '%20'))).toBe('se%cret with spaces');
  });

  it('leaves an ordinary alphanumeric credential completely untouched', async () => {
    // The encoding must be a no-op for the common case, or it would break every
    // district it was meant to protect.
    handler = allGood;
    await run();
    const decoded = Buffer.from(seen[0].auth!.replace(/^Basic /, ''), 'base64').toString('utf8');
    expect(decoded).toBe(`${CLIENT_ID}:${CLIENT_SECRET}`);
  });

  it('asks for client_credentials and only the roster-core scope', async () => {
    handler = allGood;
    await run();

    const body = seen.find((r) => r.url.includes('/token'))!.body;
    expect(body).toContain('grant_type=client_credentials');
    expect(decodeURIComponent(body)).toContain(
      'https://purl.imsglobal.org/spec/or/v1p1/scope/roster-core.readonly',
    );
    // Demographics carries birthdate, sex and race. This flow has no use for
    // any of it, and a district reviewing the grant should see that.
    expect(decodeURIComponent(body)).not.toContain('demographics');
  });

  it('fetches the token once and reuses it across both collections', async () => {
    handler = allGood;
    await run();
    expect(seen.filter((r) => r.url.includes('/token'))).toHaveLength(1);
  });

  it('a 401 at the token step blames the credential MIX-UP, not the network', async () => {
    // The most common real failure: the certificate pasted where the Consumer
    // ID and Secret belong. Same Aeries page, adjacent fields.
    handler = (req) =>
      req.url.includes('/token') ? { status: 401, body: { error: 'invalid_client' } } : allGood(req);

    const report = await run();
    expect(report.ok).toBe(false);
    expect(stepOf(report, 'token').message).toMatch(/Consumer ID and Consumer Secret/i);
    expect(stepOf(report, 'token').message).toMatch(/not the certificate/i);
  });

  it('stops after a failed token — no data request is attempted', async () => {
    handler = (req) =>
      req.url.includes('/token') ? { status: 401, body: {} } : allGood(req);

    const report = await run();
    // Exactly one request total. Probing on without a token would produce two
    // more failures that say nothing about the actual problem.
    expect(seen).toHaveLength(1);
    expect(stepOf(report, 'orgs').status).toBe('untested');
    expect(stepOf(report, 'schools').status).toBe('untested');
  });

  it('a 403 AFTER a good token reads as "not shared", not as a bad credential', async () => {
    handler = (req) => {
      if (req.url.includes('/token')) return { status: 200, body: { access_token: TOKEN } };
      return { status: 403, body: { error: 'forbidden' } };
    };

    const report = await run();
    expect(stepOf(report, 'token').status).toBe('ok');
    expect(stepOf(report, 'orgs').status).toBe('denied');
    expect(stepOf(report, 'orgs').message).toMatch(/credentials work/i);
    expect(stepOf(report, 'orgs').message).not.toMatch(/not the certificate/i);
  });

  it('a 200 that is NOT a collection is refused, not reported as "Working"', async () => {
    // Raised by Codex, and confirmed against the real code before fixing: with
    // `body?.orgs ?? []`, a 200 carrying {"error": "..."} — a proxy error page,
    // a maintenance response, an HTML-to-JSON gateway — became an empty array,
    // and the district was told "Connected. OneRoster is ready." about a
    // response we could not use at all.
    handler = (req) =>
      req.url.includes('/token')
        ? { status: 200, body: { access_token: TOKEN } }
        : { status: 200, body: { error: 'upstream unavailable' } };

    const report = await run();
    expect(report.ok).toBe(false);
    expect(report.summary).not.toMatch(/ready/i);
    expect(stepOf(report, 'orgs').status).not.toBe('ok');
  });

  it('an EMPTY collection reports "nothing is shared", not "ready"', async () => {
    // Raised by CodeRabbit, and it was right where I was wrong: I first wrote
    // this asserting the opposite. A district's OneRoster always exposes at
    // least the district org, so zero rows does not mean "no data yet" — it
    // means nothing is shared with us, and telling them "Connected. OneRoster
    // is ready." is precisely the confident-wrong-advice this feature exists to
    // prevent. 'denied', not 'error': the connection itself genuinely works.
    handler = (req) =>
      req.url.includes('/token')
        ? { status: 200, body: { access_token: TOKEN } }
        : { status: 200, body: { orgs: [] } };

    const report = await run();
    expect(report.ok).toBe(false);
    expect(report.summary).not.toMatch(/ready/i);
    expect(stepOf(report, 'orgs').status).toBe('denied');
    expect(stepOf(report, 'orgs').message).toMatch(/nothing is shared/i);
  });

  it('a 200 token response with no access_token is not reported as unreachable', async () => {
    // A real OneRoster failure mode. Reporting it as a network problem sends
    // the district to look at a firewall that is working perfectly.
    handler = (req) =>
      req.url.includes('/token') ? { status: 200, body: { token_type: 'bearer' } } : allGood(req);

    const report = await run();
    expect(stepOf(report, 'token').status).toBe('error');
    expect(stepOf(report, 'token').message).not.toMatch(/Could not reach/i);
  });

  it('REFUSES a redirect from the token endpoint — with the secret unsent', async () => {
    // The escape `redirect: 'error'` exists to close: a public host answering
    // 302 toward an internal address. Following it would carry the district's
    // consumer secret to a destination the guard never validated.
    //
    // Driven through the shared `handler` rather than by swapping the server's
    // request listener. The first version of this test called
    // `server.removeAllListeners('request')` and never restored it, so every
    // test written after it would have silently received a 302 — a landmine for
    // whoever appended the next case.
    let redirected = false;
    handler = (req) => {
      if (req.url.includes('/elsewhere')) {
        redirected = true;
        return { status: 200, body: { access_token: TOKEN } };
      }
      return { status: 302, headers: { Location: `${origin}/elsewhere` } };
    };

    const report = await run();
    expect(report.ok).toBe(false);
    expect(redirected).toBe(false);
    expect(seen).toHaveLength(1);
    expect(stepOf(report, 'token').status).not.toBe('ok');
  });

  it('leaves the shared server usable for the tests that follow it', async () => {
    // Guards the landmine above: if the redirect case ever swaps the listener
    // again, this fails immediately instead of in whatever test comes next.
    handler = allGood;
    const report = await run();
    expect(report.ok).toBe(true);
  });

  it('surfaces a dead server as unreachable, not as a credential problem', async () => {
    const report = await runOneRosterConnectionTest({
      // Port 1 is reserved and nothing listens there.
      baseUrl: 'http://127.0.0.1:1/admin',
      tokenUrl: 'http://127.0.0.1:1/admin/token/',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
    expect(stepOf(report, 'token').message).toMatch(/Could not reach/i);
    expect(stepOf(report, 'token').message).not.toMatch(/not the certificate/i);
  });
});
