/**
 * SPE-397 · OneRoster URL normalization, and that the SSRF guard is WIRED IN.
 *
 * The guard is deliberately NOT mocked here. `oneroster-setup.http.test.ts`
 * stubs it to test transport against a local server; this file mocks DNS
 * underneath the real guard and asserts the observable consequence — a bad
 * address means no request is made and no credential is sent.
 *
 * That split exists because of what happened on SPE-396: the guard had 60 tests
 * of its internals and zero proving anything CALLED it, so the entire control
 * was deletable with a green suite. OneRoster has two district-supplied URLs
 * rather than one, which doubles the number of places that can go unchecked.
 */
const mockLookup = jest.fn();
jest.mock('dns/promises', () => ({ lookup: (...a: unknown[]) => mockLookup(...a) }));

const mockFetchToken = jest.fn();
const mockGetOrgs = jest.fn();
/**
 * Every token endpoint a client was actually built for.
 *
 * The guard runs per candidate and BEFORE the client is constructed, so this
 * list is precisely the set of addresses that passed. Asserting on it is how
 * "the secret was never sent there" gets checked by address rather than by
 * "no request happened at all" — which stopped being the right property once
 * a refused token address means "try the derived ones" instead of "give up".
 */
const mockClientTokenUrls: string[] = [];
jest.mock('@/lib/integrations/oneroster', () => {
  const actual = jest.requireActual('@/lib/integrations/oneroster');
  return {
    ...actual,
    OneRosterClient: class {
      constructor(config: { tokenUrl: string }) {
        mockClientTokenUrls.push(config.tokenUrl);
      }
      fetchToken = (...a: unknown[]) => mockFetchToken(...a);
      getOrgs = (...a: unknown[]) => mockGetOrgs(...a);
      getSchools = jest.fn().mockResolvedValue([{ sourcedId: 'school-1' }]);
    },
  };
});

import {
  normalizeOneRosterBaseUrl,
  normalizeOneRosterTokenUrl,
  runOneRosterConnectionTest,
  toStoredOneRosterTestResult,
} from '@/lib/sis/oneroster-setup';

const CREDS = { clientId: 'consumer-id', clientSecret: 'consumer-secret' };

beforeEach(() => {
  jest.clearAllMocks();
  mockClientTokenUrls.length = 0;
  mockFetchToken.mockResolvedValue('token');
  mockGetOrgs.mockResolvedValue([{ sourcedId: 'org-1' }]);
});

describe('normalizeOneRosterBaseUrl', () => {
  it('keeps a plain district base URL', () => {
    expect(normalizeOneRosterBaseUrl('https://jsusdapi.aeries.net/admin')).toBe(
      'https://jsusdapi.aeries.net/admin',
    );
  });

  it('assumes https when the district pasted a bare host', () => {
    expect(normalizeOneRosterBaseUrl('jsusdapi.aeries.net/admin')).toBe(
      'https://jsusdapi.aeries.net/admin',
    );
  });

  it.each([
    'https://jsusdapi.aeries.net/admin/ims/oneroster/v1p1',
    'https://jsusdapi.aeries.net/admin/ims/oneroster/v1p1/',
  ])('strips the version segment the district pasted (%s)', (input) => {
    // They copy what their Aeries page shows, which is often the full data URL.
    // Appending our own path to that yields .../v1p1/ims/oneroster/v1p1/orgs.
    expect(normalizeOneRosterBaseUrl(input)).toBe('https://jsusdapi.aeries.net/admin');
  });

  it('drops a trailing slash so two spellings do not become two stored rows', () => {
    expect(normalizeOneRosterBaseUrl('https://jsusdapi.aeries.net/admin/')).toBe(
      'https://jsusdapi.aeries.net/admin',
    );
  });

  it('refuses http:// rather than silently upgrading it', () => {
    expect(() => normalizeOneRosterBaseUrl('http://jsusdapi.aeries.net/admin')).toThrow(/https:\/\//);
  });

  it('refuses an empty address with an instruction', () => {
    expect(() => normalizeOneRosterBaseUrl('   ')).toThrow(/Enter your OneRoster address/i);
  });

  // These are refused ONLY by the SSRF guard. Delete that call and every one
  // of them passes.
  it.each([
    ['https://127.0.0.1/admin', 'an IP literal'],
    ['https://127.0.0.1../admin', 'an IP literal wearing two trailing dots'],
    ['https://localhost/admin', 'localhost'],
    ['https://sis.internal/admin', 'an internal-only name'],
    ['https://oneroster/admin', 'a single-label intranet name'],
  ])('refuses %s (%s)', (url) => {
    expect(() => normalizeOneRosterBaseUrl(url)).toThrow();
  });

  it('speaks OneRoster, not Aeries, when it refuses', () => {
    // One shared guard serves both connectors; a OneRoster district must not be
    // told to check their "Aeries web address".
    expect(() => normalizeOneRosterBaseUrl('https://127.0.0.1/admin')).toThrow(
      /OneRoster web address/i,
    );
  });
});

describe('normalizeOneRosterTokenUrl', () => {
  it('keeps the vendor-specific token path intact, TRAILING SLASH INCLUDED', () => {
    // Aeries documents its token endpoint WITH the slash
    // (https://<district>api.aeries.net/admin/token/), and on ASP.NET the two
    // spellings can route to different endpoints. Stripping it cost a live
    // district their integration (SPE-432): they typed the documented address,
    // we saved a different one, and the documented one was never dialled.
    expect(normalizeOneRosterTokenUrl('https://jsusdapi.aeries.net/admin/token/')).toBe(
      'https://jsusdapi.aeries.net/admin/token/',
    );
    // And a path without one is left equally alone.
    expect(normalizeOneRosterTokenUrl('https://vendor.example.com/oauth/token')).toBe(
      'https://vendor.example.com/oauth/token',
    );
  });

  it('refuses http:// and internal addresses here too', () => {
    expect(() => normalizeOneRosterTokenUrl('http://jsusdapi.aeries.net/token')).toThrow(/https:\/\//);
    expect(() => normalizeOneRosterTokenUrl('https://169.254.169.254/token')).toThrow();
  });
});

describe('runOneRosterConnectionTest guards both URLs before sending a credential', () => {
  it('never posts the secret to a TOKEN url that resolves privately — but keeps looking', async () => {
    // Both halves matter. The private endpoint must never receive the consumer
    // secret; and a refused token address must not end the run, because that is
    // exactly the case resolution exists for — the district was asked for a
    // field their console never shows them (SPE-426), so a bad value there has
    // to be recoverable rather than terminal.
    mockLookup.mockImplementation((host: string) =>
      host === 'token.example.com'
        ? Promise.resolve([{ address: '10.0.0.5', family: 4 }])
        : Promise.resolve([{ address: '104.16.0.1', family: 4 }]),
    );

    const report = await runOneRosterConnectionTest({
      baseUrl: 'https://data.example.com/admin',
      tokenUrl: 'https://token.example.com/token',
      ...CREDS,
    });

    // Never built for the private address, so nothing was posted to it.
    expect(mockClientTokenUrls).not.toContain('https://token.example.com/token');
    // And the derived candidates under the district's own base were tried.
    expect(mockClientTokenUrls).toContain('https://data.example.com/admin/token');
    expect(report.ok).toBe(true);
    expect(report.usedTokenUrl).toBe('https://data.example.com/admin/token');
  });

  it('refuses outright when EVERY candidate resolves privately', async () => {
    // The other end of the same behaviour: recovering from a bad token address
    // must not become a way to reach a private host by another path.
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    const report = await runOneRosterConnectionTest({
      baseUrl: 'https://data.example.com/admin',
      tokenUrl: 'https://token.example.com/token',
      ...CREDS,
    });

    expect(report.ok).toBe(false);
    expect(mockClientTokenUrls).toHaveLength(0);
    expect(mockFetchToken).not.toHaveBeenCalled();
  });

  it('makes NO request when only the DATA url resolves privately', async () => {
    // The one a single-URL guard would miss. The token endpoint is a perfectly
    // ordinary public host; the data host is the internal one — and the token
    // request would already have carried the district's secret by the time we
    // got to it.
    mockLookup.mockImplementation((host: string) =>
      host === 'token.example.com'
        ? Promise.resolve([{ address: '104.16.0.1', family: 4 }])
        : Promise.resolve([{ address: '10.0.0.5', family: 4 }]),
    );

    const report = await runOneRosterConnectionTest({
      baseUrl: 'https://data.example.com/admin',
      tokenUrl: 'https://token.example.com/token',
      ...CREDS,
    });

    expect(report.ok).toBe(false);
    expect(report.steps[0].message).toMatch(/OneRoster address/i);
    expect(mockFetchToken).not.toHaveBeenCalled();
  });

  it('proceeds when both resolve publicly', async () => {
    // The other half: a guard that refused everything would pass both tests
    // above while breaking every real district.
    mockLookup.mockResolvedValue([{ address: '104.16.0.1', family: 4 }]);

    const report = await runOneRosterConnectionTest({
      baseUrl: 'https://data.example.com/admin',
      tokenUrl: 'https://token.example.com/token',
      ...CREDS,
    });

    expect(mockFetchToken).toHaveBeenCalled();
    expect(report.ok).toBe(true);
  });
});

describe('toStoredOneRosterTestResult', () => {
  it('keeps step names and the summary, and drops the counts', () => {
    const stored = toStoredOneRosterTestResult({
      ok: false,
      steps: [
        { key: 'token', label: 'Sign-in', status: 'ok', message: 'Working.', count: 1 },
        { key: 'orgs', label: 'Districts and schools', status: 'denied', message: 'no', count: 9 },
        { key: 'schools', label: 'Schools', status: 'ok', message: 'Working.', count: 42 },
      ],
      summary: 'Connected, but 1 of 3 checks need attention.',
    });

    expect(stored.area).toBe('Districts and schools');
    expect(stored.message).toMatch(/1 of 3/);
    // The district's own staff can read this column. How many schools a
    // district has is not something the connection log needs to remember.
    expect(JSON.stringify(stored)).not.toContain('42');
  });

  it('records "all" when everything worked', () => {
    const stored = toStoredOneRosterTestResult({
      ok: true,
      steps: [{ key: 'token', label: 'Sign-in', status: 'ok', message: 'Working.' }],
      summary: 'Connected. OneRoster is ready.',
    });
    expect(stored.area).toBe('all');
  });
});
