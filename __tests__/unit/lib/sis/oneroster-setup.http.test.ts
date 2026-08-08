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
import { logger } from '@/lib/logger';

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

describe('resolving the token endpoint when the stored one is wrong (SPE-426)', () => {
  const runWith = (tokenUrl: string) =>
    runOneRosterConnectionTest({
      baseUrl: `${origin}/admin`,
      tokenUrl,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

  it('finds the working token endpoint when the stored one 404s', async () => {
    // The district could only ever guess this field — their console does not
    // show it — so a wrong guess must not be a dead end.
    handler = (req) => {
      if (req.url.startsWith('/admin/token')) return { status: 404, body: { message: 'nope' } };
      if (req.url.includes('/oauth/token')) {
        return { status: 200, body: { access_token: TOKEN, token_type: 'bearer', expires_in: 3600 } };
      }
      return { status: 200, body: { orgs: [{ sourcedId: 'org-1', name: 'Sim USD', type: 'district' }] } };
    };

    const report = await runWith(`${origin}/admin/token`);

    expect(stepOf(report, 'token').status).toBe('ok');
    expect(report.usedTokenUrl).toBe(`${origin}/admin/oauth/token`);
  });

  it('reports nothing extra when the stored endpoint already works', async () => {
    handler = allGood;
    const report = await runWith(`${origin}/admin/token`);

    expect(stepOf(report, 'token').status).toBe('ok');
    // Absent, not equal-to-stored — the field means "we had to look elsewhere".
    expect(report.usedTokenUrl).toBeUndefined();
    expect(stepOf(report, 'token').message).toBe('Working.');
  });

  it('does not treat a trailing slash on the stored endpoint as a different one', async () => {
    handler = allGood;
    const report = await runWith(`${origin}/admin/token/`);

    expect(stepOf(report, 'token').status).toBe('ok');
    expect(report.usedTokenUrl).toBeUndefined();
  });

  it('derives the endpoint when the district gave us none, and says which it used', async () => {
    // The field is optional now precisely because an Aeries OneRoster console
    // never shows it. Left blank, a district must still get a working test.
    handler = allGood;
    const report = await runOneRosterConnectionTest({
      baseUrl: `${origin}/admin`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

    expect(report.ok).toBe(true);
    expect(report.usedTokenUrl).toBe(`${origin}/admin/token`);
    expect(stepOf(report, 'token').message).toContain(`${origin}/admin/token`);
  });

  it('never guesses a token endpoint OUTSIDE the path the district gave us', async () => {
    // A district on a shared host — `https://sis.example.org/aeries` — does not
    // own `https://sis.example.org/`. Climbing to the origin to look for a
    // token endpoint would hand their consumer secret to whatever application
    // answers at the root. Every candidate stays under their own path.
    handler = () => ({ status: 404, body: { message: 'nope' } });

    await runOneRosterConnectionTest({
      baseUrl: `${origin}/admin`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen) expect(r.url.startsWith('/admin/')).toBe(true);
  });

  it('keeps looking past a 405 — something is there, but it is not a token endpoint', async () => {
    // A vendor's data path answers a POST exactly like this. A 404-only check
    // stops here and tells the district their credentials are wrong.
    handler = (req) => {
      if (req.url.startsWith('/admin/token')) return { status: 405, body: { message: 'nope' } };
      if (req.url.includes('/oauth/token')) {
        return { status: 200, body: { access_token: TOKEN, token_type: 'bearer', expires_in: 3600 } };
      }
      return { status: 200, body: { orgs: [{ sourcedId: 'org-1', name: 'Sim USD', type: 'district' }] } };
    };

    const report = await runWith(`${origin}/admin/token`);

    expect(stepOf(report, 'token').status).toBe('ok');
    expect(report.usedTokenUrl).toBe(`${origin}/admin/oauth/token`);
  });

  it('keeps looking past a 200 that carries no token', async () => {
    // The wrong endpoint wearing a success status — a landing page, a data
    // collection, a proxy's maintenance body. Stopping here would report
    // "the token endpoint answered but returned no access token" about an
    // address that was never the token endpoint.
    handler = (req) => {
      if (req.url.startsWith('/admin/token')) return { status: 200, body: { hello: 'world' } };
      if (req.url.includes('/oauth/token')) {
        return { status: 200, body: { access_token: TOKEN, token_type: 'bearer', expires_in: 3600 } };
      }
      return { status: 200, body: { orgs: [{ sourcedId: 'org-1', name: 'Sim USD', type: 'district' }] } };
    };

    const report = await runWith(`${origin}/admin/token`);

    expect(stepOf(report, 'token').status).toBe('ok');
    expect(report.usedTokenUrl).toBe(`${origin}/admin/oauth/token`);
  });

  it('STOPS at a real upstream 502 — their endpoint exists and is broken', async () => {
    // Raised by CodeRabbit, and it was right. `fetchToken` marks "answered but
    // the body is not a token" with a SYNTHETIC 502, and `dial` raises a real
    // gateway 502 with the same number. Keyed on the status alone the two were
    // indistinguishable, so a district whose token endpoint was briefly behind
    // a broken gateway had their consumer secret posted to two more paths for
    // nothing. Now separated by a flag on the error, not by the number.
    handler = () => ({ status: 502, body: { message: 'bad gateway' } });

    const report = await runWith(`${origin}/admin/token`);

    expect(report.ok).toBe(false);
    // Exactly one. The whole point of the finding.
    expect(seen.filter((r) => r.url.includes('token'))).toHaveLength(1);
    expect(report.usedTokenUrl).toBeUndefined();
  });

  it('names the endpoint it CHOSE when sign-in fails, not just that sign-in failed', async () => {
    // The district left the field blank, so we picked an address for them. Being
    // told the Consumer ID and Secret are wrong, with no mention that an address
    // was guessed, is the same dead end one field over.
    handler = () => ({ status: 401, body: { error: 'invalid_client' } });

    const report = await runOneRosterConnectionTest({
      baseUrl: `${origin}/admin`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

    expect(report.ok).toBe(false);
    expect(stepOf(report, 'token').message).toMatch(/Consumer ID and Consumer Secret/i);
    expect(stepOf(report, 'token').message).toContain(`${origin}/admin/token`);
  });

  it('names what it tried when NOTHING answers and the field was left blank', async () => {
    // With no stored address there is nothing to report the failure against, so
    // reporting against an empty string would tell them nothing at all.
    handler = () => ({ status: 404, body: { message: 'nope' } });

    const report = await runOneRosterConnectionTest({
      baseUrl: `${origin}/admin`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

    expect(report.ok).toBe(false);
    expect(stepOf(report, 'token').message).toContain(`${origin}/admin/token`);
  });

  it('STOPS at a 401 rather than trying other endpoints with the same credentials', async () => {
    // Two reasons this matters. A 401 means the endpoint exists and the
    // credentials are wrong — the district's real problem, which walking on
    // would replace with "check your address". And every extra candidate posts
    // the consumer secret somewhere new; there is no reason to keep spraying it
    // once an endpoint has answered.
    handler = () => ({ status: 401, body: { message: 'bad creds' } });

    const report = await runWith(`${origin}/admin/token`);

    expect(report.ok).toBe(false);
    expect(report.usedTokenUrl).toBeUndefined();
    expect(stepOf(report, 'token').message).toMatch(/Consumer ID and Consumer Secret/i);

    const tokenPosts = seen.filter((r) => r.url.includes('token'));
    expect(tokenPosts).toHaveLength(1);
  });

  it('names nothing when no candidate serves a token endpoint', async () => {
    handler = () => ({ status: 404, body: { message: 'nope' } });

    const report = await runWith(`${origin}/admin/token`);

    expect(report.ok).toBe(false);
    expect(report.usedTokenUrl).toBeUndefined();
    // Points at the address they DID give us. Telling them to fix the token
    // address would send them to correct the field we tell them to leave blank.
    expect(stepOf(report, 'token').message).toMatch(/under your OneRoster address/i);
  });
});

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

  it('encodes the sub-delimiters encodeURIComponent leaves alone', async () => {
    // The gap CodeRabbit found in the hand-rolled helper this replaced:
    // encodeURIComponent leaves ! ' ( ) ~ unescaped, where form encoding
    // percent-escapes them. Invisible to a compliant server — `!` and `%21`
    // both decode to `!` — but pinning it means nobody has to re-derive the
    // character set, which is how the hand-rolled version went wrong.
    handler = allGood;
    await runOneRosterConnectionTest({
      baseUrl: `${origin}/admin`,
      tokenUrl: `${origin}/admin/token/`,
      clientId: "id!'()~",
      clientSecret: "secret!'()~",
    });

    const decoded = Buffer.from(seen[0].auth!.replace(/^Basic /, ''), 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');

    expect(user).toBe('id%21%27%28%29%7E');
    expect(pass).toBe('secret%21%27%28%29%7E');
    // And still round-trips to what the district actually typed.
    expect(decodeURIComponent(user)).toBe("id!'()~");
    expect(decodeURIComponent(pass)).toBe("secret!'()~");
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

  it('blames OURSELVES, not the district, when the endpoint rejects the SCOPE', async () => {
    // The distinction the error code exists for (SPE-430). `invalid_scope` means
    // the endpoint understood the request and objected to how WE built it — the
    // credentials were never evaluated. A 400 alone cannot tell that apart from
    // a real credential failure, and we were about to ask a live district to
    // re-enter credentials that may have been correct all along.
    handler = (req) =>
      req.url.includes('/token')
        ? { status: 400, body: { error: 'invalid_scope', error_description: 'no such scope' } }
        : allGood(req);

    const report = await run();

    expect(report.ok).toBe(false);
    expect(stepOf(report, 'token').message).toMatch(/not your credentials/i);
    expect(stepOf(report, 'token').message).toMatch(/ours to fix/i);
    // And emphatically NOT the "re-copy your Consumer ID" advice.
    expect(stepOf(report, 'token').message).not.toMatch(/Consumer ID/i);
  });

  it('also blames ourselves on invalid_request — the likeliest our-fault code', async () => {
    // Raised by Codex, and it is the one that mattered most: a token endpoint
    // that does not implement the `scope` parameter we always send commonly
    // answers `invalid_request` rather than `invalid_scope`. Omitting it left
    // the single most probable our-fault case still blaming the district — in
    // a change whose entire purpose was to stop doing that.
    handler = (req) =>
      req.url.includes('/token')
        ? { status: 400, body: { error: 'invalid_request' } }
        : allGood(req);

    const report = await run();

    expect(stepOf(report, 'token').message).toMatch(/not your credentials/i);
    expect(stepOf(report, 'token').message).not.toMatch(/Consumer ID/i);
  });

  it('does NOT let an OAuth body override the address advice on a 404', async () => {
    // The code is only meaningful on the statuses a token endpoint uses to
    // report one. Checked at the top level it also caught 404/405/5xx, so a
    // candidate that 404'd with an OAuth-shaped body would claim "nothing for
    // you to change" and bury the true problem: nothing answered at all.
    handler = () => ({ status: 404, body: { error: 'invalid_scope' } });

    const report = await runOneRosterConnectionTest({
      baseUrl: `${origin}/admin`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

    expect(report.ok).toBe(false);
    expect(stepOf(report, 'token').message).toMatch(/under your OneRoster address/i);
    expect(stepOf(report, 'token').message).not.toMatch(/ours to fix/i);
  });

  it('still blames the credentials on invalid_client', async () => {
    // The other half. A change that reported everything as our fault would pass
    // the test above while hiding every genuine credential problem.
    handler = (req) =>
      req.url.includes('/token')
        ? { status: 400, body: { error: 'invalid_client' } }
        : allGood(req);

    const report = await run();

    expect(stepOf(report, 'token').message).toMatch(/Consumer ID and Consumer Secret/i);
  });

  it('IGNORES an error code outside the RFC allow-list — checked at the LOG', async () => {
    // The safety property, asserted where the value actually travels. A token
    // endpoint's error body can echo the submitted credentials, so only the six
    // RFC 6749 codes are ever read out of it.
    //
    // The first version of this test asserted over the returned report and was
    // VACUOUS: an unrecognised code never reaches the report either way,
    // because `explain` only branches on two known values. Deleting the
    // allow-list left it green. The log line is the real path — it is where the
    // code goes, and it is written to Vercel's logs.
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    try {
      handler = (req) =>
        req.url.includes('/token')
          ? { status: 400, body: { error: `leaked-${CLIENT_SECRET}` } }
          : allGood(req);

      const report = await run();

      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).toContain('OneRoster API request failed');
      expect(logged).not.toContain(CLIENT_SECRET);
      expect(logged).not.toContain('leaked-');
      // And the district still gets the ordinary credential advice.
      expect(stepOf(report, 'token').message).toMatch(/Consumer ID and Consumer Secret/i);
    } finally {
      spy.mockRestore();
    }
  });

  it('DOES log a recognised code, so the allow-list is not just "log nothing"', async () => {
    // The other half of the property above. A readOAuthErrorCode that always
    // returned undefined would pass every safety assertion while making the
    // whole feature useless — this is the diagnostic we built it for.
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    try {
      handler = (req) =>
        req.url.includes('/token')
          ? { status: 400, body: { error: 'invalid_scope' } }
          : allGood(req);

      await run();

      expect(JSON.stringify(spy.mock.calls)).toContain('invalid_scope');
    } finally {
      spy.mockRestore();
    }
  });

  it('never surfaces the error_description, only the code', async () => {
    // `error_description` is free text straight from the district's server. It
    // is the obvious next thing to reach for and the one that could carry
    // anything, so it is asserted absent rather than merely not used.
    handler = (req) =>
      req.url.includes('/token')
        ? {
            status: 400,
            body: { error: 'invalid_client', error_description: `secret=${CLIENT_SECRET}` },
          }
        : allGood(req);

    const report = await run();

    expect(JSON.stringify(report)).not.toContain(CLIENT_SECRET);
    expect(JSON.stringify(report)).not.toContain('error_description');
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
