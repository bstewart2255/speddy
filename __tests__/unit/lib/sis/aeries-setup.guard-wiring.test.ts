/**
 * SPE-396 · the SSRF guard is actually WIRED IN — not merely correct.
 *
 * WHY THIS FILE IS SEPARATE. `ssrf-guard.test.ts` has 60-odd tests proving the
 * guard classifies addresses correctly, and `aeries-setup.test.ts` stubs
 * `assertPublicAeriesHost` to pass so it can test the diagnostics without DNS.
 * Between them they leave the one thing that matters unpinned: whether anything
 * CALLS the guard. Deleting both call sites in `aeries-setup.ts` left the whole
 * suite green — 86 suites, 866 tests, typecheck and lint clean — with the
 * control entirely gone. A security check nothing invokes is decoration.
 *
 * So these tests deliberately do NOT mock the guard. They mock DNS underneath
 * it, which is the only part that needs to be deterministic, and assert on the
 * observable consequence: a private address means no request is ever made.
 */
const mockLookup = jest.fn();
jest.mock('dns/promises', () => ({ lookup: (...a: unknown[]) => mockLookup(...a) }));

const mockGetSchools = jest.fn();
jest.mock('@/lib/integrations/aeries', () => {
  const actual = jest.requireActual('@/lib/integrations/aeries');
  return {
    ...actual,
    AeriesClient: class {
      getSchools = (...a: unknown[]) => mockGetSchools(...a);
      getSchoolStudents = jest.fn();
      getSchoolTeachers = jest.fn();
      getStudentPrograms = jest.fn();
    },
  };
});

import { normalizeAeriesBaseUrl, runAeriesConnectionTest } from '@/lib/sis/aeries-setup';

const CERT = '477abe9e7d27439681d62f4e0de1f5e1';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSchools.mockResolvedValue([{ SchoolCode: 1, Name: 'Sim High' }]);
});

describe('normalizeAeriesBaseUrl calls the syntactic guard', () => {
  // Each of these is refused ONLY by assertPublicAeriesHostSyntax — nothing
  // else in the normalizer would reject them. Remove that one line and every
  // case here fails, which is the point.
  it.each([
    ['https://127.0.0.1/', 'an IPv4 literal'],
    ['https://127.0.0.1../', 'an IPv4 literal wearing two trailing dots'],
    ['https://localhost/', 'localhost'],
    ['https://sis.internal/', 'an internal-only name'],
    ['https://aeries/', 'a single-label intranet name'],
  ])('refuses %s (%s)', (url) => {
    expect(() => normalizeAeriesBaseUrl(url)).toThrow();
  });

  it('still accepts a real district address', () => {
    expect(normalizeAeriesBaseUrl('https://demo.aeries.net')).toBe(
      'https://demo.aeries.net/aeries/api/v5',
    );
  });
});

describe('runAeriesConnectionTest calls the resolving guard', () => {
  it('makes NO request when the name resolves to a private address', async () => {
    // The scenario the syntactic half cannot catch: a perfectly ordinary
    // hostname whose A record points inside the network.
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    const report = await runAeriesConnectionTest({
      baseUrl: 'https://sis.example.com/aeries/api/v5',
      certificate: CERT,
    });

    expect(report.ok).toBe(false);
    expect(report.areas[0].message).toMatch(/private network/i);
    // The assertion that actually pins the wiring. Reporting an error while
    // still dialling the address would satisfy every other check here.
    expect(mockGetSchools).not.toHaveBeenCalled();
  });

  it('makes NO request when a name resolves to a NAT64-encoded internal address', async () => {
    // Same wiring, but through the IPv6 classifier — which allowed this exact
    // address until the deny-list became an allow-list.
    mockLookup.mockResolvedValue([{ address: '64:ff9b::a9fe:a9fe', family: 6 }]);

    const report = await runAeriesConnectionTest({
      baseUrl: 'https://sis.example.com/aeries/api/v5',
      certificate: CERT,
    });

    expect(report.ok).toBe(false);
    expect(mockGetSchools).not.toHaveBeenCalled();
  });

  it('makes NO request for an http:// base, even to a perfectly public host', async () => {
    // The host here is fine — the scheme is the whole problem. Probing it would
    // put the district's Aeries certificate on the wire in cleartext.
    //
    // Nothing can store such a row today: both write paths refuse http:// and
    // the table is empty. This is the last checkpoint before the AERIES-CERT
    // header is sent, and the only one that sees the URL a probe will really
    // dial rather than the one somebody typed into a form.
    mockLookup.mockResolvedValue([{ address: '104.16.0.1', family: 4 }]);

    const report = await runAeriesConnectionTest({
      baseUrl: 'http://demo.aeries.net/aeries/api/v5',
      certificate: CERT,
    });

    expect(report.ok).toBe(false);
    expect(report.areas[0].message).toMatch(/https:\/\//);
    expect(mockGetSchools).not.toHaveBeenCalled();
  });

  it('makes NO request for a baseUrl that is not a url at all', async () => {
    const report = await runAeriesConnectionTest({ baseUrl: 'not a url', certificate: CERT });
    expect(report.ok).toBe(false);
    expect(mockGetSchools).not.toHaveBeenCalled();
  });

  it('proceeds normally when the name resolves publicly', async () => {
    // The other half: a guard that refused everything would pass the two tests
    // above while breaking every real district.
    mockLookup.mockResolvedValue([{ address: '104.16.0.1', family: 4 }]);

    await runAeriesConnectionTest({
      baseUrl: 'https://demo.aeries.net/aeries/api/v5',
      certificate: CERT,
    });

    expect(mockGetSchools).toHaveBeenCalled();
  });
});
