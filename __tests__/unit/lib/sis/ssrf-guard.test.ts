/**
 * SPE-396 · the SSRF guard on district-supplied Aeries addresses.
 *
 * Found by review, and confirmed against the code before it was written: the
 * original normalizer accepted `https://127.0.0.1:8443`, `https://10.0.0.5`,
 * and — worst — `https://169.254.169.254`, the cloud metadata endpoint. The
 * connection test then makes authenticated requests to whatever is stored and
 * reports, per HTTP status, what answered. That is a port scanner running from
 * our production egress, aimed by a customer.
 *
 * `isPrivateAddress` is tested directly rather than only through DNS, because a
 * range that is wrong there is invisible until someone actually points a name
 * at it.
 */
import {
  assertPublicSisHost,
  assertPublicSisHostSyntax,
  isPrivateAddress,
  AERIES_URL_LABELS as L,
  ONEROSTER_URL_LABELS,
} from '@/lib/sis/ssrf-guard';

const mockLookup = jest.fn();
jest.mock('dns/promises', () => ({ lookup: (...a: unknown[]) => mockLookup(...a) }));

beforeEach(() => jest.clearAllMocks());

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.0.0.5', 'private class A'],
    ['172.16.0.1', 'private class B, low edge'],
    ['172.31.255.254', 'private class B, high edge'],
    ['192.168.1.1', 'private class C'],
    ['169.254.169.254', 'link-local — the cloud metadata endpoint'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'this network'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    // These three arms were each deletable with the suite green.
    ['198.18.0.1', 'benchmarking range, low edge'],
    ['198.19.255.254', 'benchmarking range, high edge'],
    ['192.0.0.1', 'IETF protocol assignments'],
    ['192.0.2.5', 'TEST-NET-1, inside the same 192.0/16 arm'],
    // Fail closed on anything that is not four valid octets: a classifier that
    // returned "not private" for input it could not parse would be worse than
    // no classifier, because the caller reads false as a positive clearance.
    ['not.an.ip.at.all', 'unparseable'],
    ['10.0.0', 'too few octets'],
    ['999.0.0.1', 'octet out of range'],
  ])('rejects %s (%s)', (addr) => {
    expect(isPrivateAddress(addr, 4)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public resolver'],
    ['104.16.0.1', 'public CDN'],
    ['172.15.0.1', 'just below the private class B block'],
    ['172.32.0.1', 'just above the private class B block'],
    ['100.63.255.255', 'just below carrier-grade NAT'],
    ['100.128.0.1', 'just above carrier-grade NAT'],
  ])('allows %s (%s)', (addr) => {
    expect(isPrivateAddress(addr, 4)).toBe(false);
  });

  it.each([
    ['::1', 'IPv6 loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'unique local'],
    ['fd12:3456::1', 'unique local'],
    ['fe80::1', 'link-local'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private address'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata endpoint'],
    ['ff02::1', 'multicast — all nodes on the link'],
    ['ff05::1:3', 'multicast — site-local DHCP servers'],
  ])('rejects IPv6 %s (%s)', (addr) => {
    expect(isPrivateAddress(addr, 6)).toBe(true);
  });

  // Every one of these was ALLOWED by the deny-list this replaced, and every
  // one is a different spelling of an address the IPv4 side already refuses.
  // They are listed out rather than summarised because the failure they guard
  // against is precisely "we only thought of four spellings".
  it.each([
    ['64:ff9b::a9fe:a9fe', 'NAT64 — reaches 169.254.169.254 on any DNS64 network'],
    ['64:ff9b::a00:5', 'NAT64 — reaches 10.0.0.5'],
    ['::169.254.169.254', 'IPv4-compatible metadata endpoint'],
    ['::127.0.0.1', 'IPv4-compatible loopback'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback written in hex, not dotted quad'],
    ['fec0::1', 'site-local — one nibble outside the old fe[89ab] arm'],
    ['2002:a9fe:a9fe::', '6to4-encoded metadata endpoint'],
    ['2002:7f00:1::', '6to4-encoded loopback'],
    ['2001::7f00:1', 'Teredo'],
    ['fe80::1%eth0', 'link-local carrying a zone id'],
  ])('rejects IPv6 %s (%s)', (addr) => {
    expect(isPrivateAddress(addr, 6)).toBe(true);
  });

  // The other half of an allow-list: it must not lock a real district out.
  // Rejecting a genuine Aeries host is the expensive failure — there is no
  // workaround for the district, whereas a missed private range is defence in
  // depth we still have other layers for.
  it.each([
    ['2606:4700:4700::1111', 'Cloudflare'],
    ['2a00:1450:4001:80e::200e', 'Google, 2a00::/12'],
    ['2001:4860:4860::8888', 'Google DNS — 2001::/16 but NOT Teredo'],
    ['3fff::1', 'top of the 2000::/3 global unicast range'],
  ])('allows public IPv6 %s (%s)', (addr) => {
    expect(isPrivateAddress(addr, 6)).toBe(false);
  });
});

describe('assertPublicSisHostSyntax', () => {
  it.each([
    ['127.0.0.1', 'loopback literal'],
    ['10.0.0.5', 'private literal'],
    ['169.254.169.254', 'metadata literal'],
    ['::1', 'IPv6 literal'],
    ['[::1]', 'bracketed IPv6 literal'],
  ])('refuses the IP literal %s (%s)', (host) => {
    expect(() => assertPublicSisHostSyntax(host, L)).toThrow(/not an IP address/i);
  });

  it.each(['localhost', 'sub.localhost', 'localhost.'])('refuses %s', (host) => {
    expect(() => assertPublicSisHostSyntax(host, L)).toThrow(/this server/i);
  });

  it.each(['localhost.', 'sis.internal.', 'aeries.local.'])(
    'refuses the fully-qualified trailing-dot form %s',
    (host) => {
      // Found by probing the guard rather than reading it: a trailing dot is
      // the fully-qualified form of the same name and resolves identically,
      // but `endsWith('.internal')` and `=== 'localhost'` both miss it.
      expect(() => assertPublicSisHostSyntax(host, L)).toThrow();
    },
  );

  it.each(['sis.internal', 'aeries.local', 'server.corp', 'box.lan'])(
    'refuses the internal-only name %s',
    (host) => {
      expect(() => assertPublicSisHostSyntax(host, L)).toThrow(/inside your network/i);
    },
  );

  it('refuses a single-label intranet shortcut', () => {
    expect(() => assertPublicSisHostSyntax('aeries', L)).toThrow(/internal shortcut/i);
  });

  // The reason this guard takes labels at all. One audited control serves every
  // SIS, but a OneRoster district must not be told to check their "Aeries web
  // address" — the alternative to this parameter was a second copy of the file,
  // which is the security control most likely to drift out of sync.
  it('speaks the right product name to a OneRoster district', () => {
    expect(() => assertPublicSisHostSyntax('127.0.0.1', ONEROSTER_URL_LABELS)).toThrow(
      /OneRoster web address/i,
    );
    expect(() => assertPublicSisHostSyntax('sis.internal', ONEROSTER_URL_LABELS)).toThrow(
      /so OneRoster needs a publicly reachable address/i,
    );
    // Not `.not.toThrow(/Aeries/i)` — that fails, and correctly so: the
    // OneRoster example address is `yourdistrictapi.aeries.net`, because Aeries
    // is who hosts OneRoster for these districts. What must not leak is the
    // PRODUCT name in the instruction, so that is what is asserted.
    expect(() => assertPublicSisHostSyntax('127.0.0.1', ONEROSTER_URL_LABELS)).not.toThrow(
      /Aeries web address/i,
    );
  });

  it('accepts a real district hostname', () => {
    expect(() => assertPublicSisHostSyntax('jsusd.aeries.net', L)).not.toThrow();
    expect(() => assertPublicSisHostSyntax('sis.somedistrict.k12.ca.us', L)).not.toThrow();
  });
});

describe('assertPublicSisHost', () => {
  it('accepts a name that resolves publicly', async () => {
    mockLookup.mockResolvedValue([{ address: '104.16.0.1', family: 4 }]);
    await expect(assertPublicSisHost('demo.aeries.net', L)).resolves.toBeUndefined();
  });

  it('refuses a public-looking name that resolves to a private address', async () => {
    // The attack the syntax check alone cannot stop: nothing prevents a
    // district from pointing sis.example.com at 10.0.0.5.
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(assertPublicSisHost('sis.example.com', L)).rejects.toThrow(/private network/i);
  });

  it('refuses when ANY resolved address is private, not just the first', async () => {
    // A name with one public and one private record would otherwise pass the
    // check and then be dialled at whichever the resolver happened to pick.
    mockLookup.mockResolvedValue([
      { address: '104.16.0.1', family: 4 },
      { address: '192.168.1.10', family: 4 },
    ]);
    await expect(assertPublicSisHost('sis.example.com', L)).rejects.toThrow(/private network/i);
  });

  it('refuses a name that resolves to nothing', async () => {
    mockLookup.mockResolvedValue([]);
    await expect(assertPublicSisHost('sis.example.com', L)).rejects.toThrow(/private network/i);
  });

  it('reports an unresolvable name as a typo, not a security refusal', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicSisHost('typo.aeries.net', L)).rejects.toThrow(/couldn't find/i);
  });

  it('applies the syntax check before spending a DNS lookup', async () => {
    await expect(assertPublicSisHost('127.0.0.1', L)).rejects.toThrow(/not an IP address/i);
    expect(mockLookup).not.toHaveBeenCalled();
  });
});
