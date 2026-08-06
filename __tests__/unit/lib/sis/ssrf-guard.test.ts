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
  assertPublicAeriesHost,
  assertPublicAeriesHostSyntax,
  isPrivateAddress,
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
  ])('rejects IPv6 %s (%s)', (addr) => {
    expect(isPrivateAddress(addr, 6)).toBe(true);
  });

  it('allows a public IPv6 address', () => {
    expect(isPrivateAddress('2606:4700::1111', 6)).toBe(false);
  });
});

describe('assertPublicAeriesHostSyntax', () => {
  it.each([
    ['127.0.0.1', 'loopback literal'],
    ['10.0.0.5', 'private literal'],
    ['169.254.169.254', 'metadata literal'],
    ['::1', 'IPv6 literal'],
    ['[::1]', 'bracketed IPv6 literal'],
  ])('refuses the IP literal %s (%s)', (host) => {
    expect(() => assertPublicAeriesHostSyntax(host)).toThrow(/not an IP address/i);
  });

  it.each(['localhost', 'sub.localhost', 'localhost.'])('refuses %s', (host) => {
    expect(() => assertPublicAeriesHostSyntax(host)).toThrow(/this server/i);
  });

  it.each(['localhost.', 'sis.internal.', 'aeries.local.'])(
    'refuses the fully-qualified trailing-dot form %s',
    (host) => {
      // Found by probing the guard rather than reading it: a trailing dot is
      // the fully-qualified form of the same name and resolves identically,
      // but `endsWith('.internal')` and `=== 'localhost'` both miss it.
      expect(() => assertPublicAeriesHostSyntax(host)).toThrow();
    },
  );

  it.each(['sis.internal', 'aeries.local', 'server.corp', 'box.lan'])(
    'refuses the internal-only name %s',
    (host) => {
      expect(() => assertPublicAeriesHostSyntax(host)).toThrow(/inside your network/i);
    },
  );

  it('refuses a single-label intranet shortcut', () => {
    expect(() => assertPublicAeriesHostSyntax('aeries')).toThrow(/internal shortcut/i);
  });

  it('accepts a real district hostname', () => {
    expect(() => assertPublicAeriesHostSyntax('jsusd.aeries.net')).not.toThrow();
    expect(() => assertPublicAeriesHostSyntax('sis.somedistrict.k12.ca.us')).not.toThrow();
  });
});

describe('assertPublicAeriesHost', () => {
  it('accepts a name that resolves publicly', async () => {
    mockLookup.mockResolvedValue([{ address: '104.16.0.1', family: 4 }]);
    await expect(assertPublicAeriesHost('demo.aeries.net')).resolves.toBeUndefined();
  });

  it('refuses a public-looking name that resolves to a private address', async () => {
    // The attack the syntax check alone cannot stop: nothing prevents a
    // district from pointing sis.example.com at 10.0.0.5.
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(assertPublicAeriesHost('sis.example.com')).rejects.toThrow(/private network/i);
  });

  it('refuses when ANY resolved address is private, not just the first', async () => {
    // A name with one public and one private record would otherwise pass the
    // check and then be dialled at whichever the resolver happened to pick.
    mockLookup.mockResolvedValue([
      { address: '104.16.0.1', family: 4 },
      { address: '192.168.1.10', family: 4 },
    ]);
    await expect(assertPublicAeriesHost('sis.example.com')).rejects.toThrow(/private network/i);
  });

  it('refuses a name that resolves to nothing', async () => {
    mockLookup.mockResolvedValue([]);
    await expect(assertPublicAeriesHost('sis.example.com')).rejects.toThrow(/private network/i);
  });

  it('reports an unresolvable name as a typo, not a security refusal', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicAeriesHost('typo.aeries.net')).rejects.toThrow(/couldn't find/i);
  });

  it('applies the syntax check before spending a DNS lookup', async () => {
    await expect(assertPublicAeriesHost('127.0.0.1')).rejects.toThrow(/not an IP address/i);
    expect(mockLookup).not.toHaveBeenCalled();
  });
});
