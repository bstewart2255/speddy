/**
 * Keep district-supplied SIS addresses pointed at the public internet (SPE-396).

 * Shared by every SIS connector (Aeries, OneRoster). Only the wording of a
 * refusal differs per product — see `SisUrlLabels`.
 *
 * WHY THIS EXISTS. A district tech admin types the address their SIS lives at,
 * and our server then makes authenticated requests to it and reports, per
 * status code, what answered. Without a guard that is a host-and-port scanner
 * running from our production egress, driven by a customer: point it at
 * `https://10.0.0.5:8443` or `https://169.254.169.254` (the cloud metadata
 * endpoint) and the diagnostics distinguish "connected", "denied", "not found"
 * and "unreachable" for you.
 *
 * Two layers, because either alone is bypassable:
 *   - syntactic (`assertPublicSisHostSyntax`): reject IP literals and
 *     obviously-internal names before anything is stored;
 *   - resolved (`assertPublicSisHost`): resolve the name and reject if it
 *     lands on a private, loopback, link-local, or carrier-NAT address —
 *     because `sis.example.com` is free to be an A record for 10.0.0.5.
 *
 * KNOWN LIMIT, stated rather than papered over: this does not close DNS
 * rebinding. A name that resolves public at check time and private at fetch
 * time would still be followed, because Node's fetch resolves again itself.
 * Closing that needs a pinned-IP dialer. The residual risk is bounded — the
 * caller is authenticated, is a named district's tech admin, and no response
 * body is ever returned to them — so it is accepted here and noted for
 * whoever raises the ceiling later.
 */
import { lookup } from 'dns/promises';

/**
 * What to call the thing in a refusal message, and an address to show as an
 * example.
 *
 * The guard is shared by every SIS we connect to, and the wording is the only
 * part that differs. Telling a OneRoster district to "enter your Aeries web
 * address" is its own small bug, and the alternative — a second copy of this
 * file per SIS — is much worse: it is the security control that would drift.
 */
export interface SisUrlLabels {
  /** What the district calls it: "Aeries", "OneRoster". */
  product: string;
  /** A concrete address of the right shape for that product. */
  example: string;
}

export const AERIES_URL_LABELS: SisUrlLabels = {
  product: 'Aeries',
  example: 'https://yourdistrict.aeries.net',
};

export const ONEROSTER_URL_LABELS: SisUrlLabels = {
  product: 'OneRoster',
  example: 'https://yourdistrictapi.aeries.net/admin',
};

/** Reject any literal IP address, and names that cannot be public. */
export function assertPublicSisHostSyntax(hostname: string, labels: SisUrlLabels): void {
  // Strip ALL trailing dots before ANY comparison. `localhost.` is the
  // fully-qualified form of `localhost`, resolves identically, and would
  // otherwise sail past every check below.
  //
  // `\.+$`, not `\.$`: the first version of this stripped exactly one dot, and
  // `127.0.0.1..` then defeated the whole function — the IP-literal regex is
  // anchored, so a leftover dot means it no longer matches, and every name
  // check falls through the same way. The write path accepted it and stored
  // `https://127.0.0.1../aeries/api/v5`. Fixing one spelling of a trailing dot
  // and leaving the next is how the IPv6 branch below went wrong too.
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');

  // No district hands out a bare IP for their SIS; every real instance is a
  // hostname. Refusing literals removes the whole IPv4/IPv6 literal surface
  // before it needs picking apart.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    throw new Error(
      `Enter your ${labels.product} web address as a name (for example ${labels.example}), not an IP address.`,
    );
  }

  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error(
      `That address points at this server rather than your ${labels.product} instance.`,
    );
  }

  // Names that only resolve inside a private network. Speddy runs in the cloud
  // and could never reach these, so accepting one guarantees a confusing
  // failure later even in the innocent case.
  if (/\.(local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) {
    throw new Error(
      `That address is only reachable inside your network. Speddy connects over the public internet, so ${labels.product} needs a publicly reachable address.`,
    );
  }

  // A single label ("aeries", "sis") is an intranet short name.
  if (!host.includes('.')) {
    throw new Error(
      `That address looks like an internal shortcut. Use the full public address, for example ${labels.example}`,
    );
  }
}

/** True when an IPv4/IPv6 address is one we must never dial on a caller's behalf. */
export function isPrivateAddress(address: string, family: number): boolean {
  if (family === 4) {
    const p = address.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    return (
      a === 0 || // "this network"
      a === 10 || // private
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local — includes cloud metadata
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 192 && b === 0) || // protocol assignments / IETF
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast + reserved
    );
  }

  // IPv6 is an ALLOW-list, deliberately, and this is the one place the two
  // families are treated differently.
  //
  // It started as a deny-list — ::1, ::ffff:<v4>, fc00::/7, fe80::/10, ff00::/8
  // — and that was wrong in nine ways at once, every one of them a spelling of
  // an address the IPv4 side already refused: NAT64 (64:ff9b::a9fe:a9fe reaches
  // 169.254.169.254 on any DNS64 network), 6to4 (2002:a9fe:a9fe::), the
  // IPv4-compatible form (::169.254.169.254), site-local fec0::/10 — which
  // `fe[89ab]` misses by one nibble — and even ::ffff:7f00:1, the plain hex
  // spelling of the IPv4-mapped address the deny-list was built to catch.
  // Enumerating the ways to write "loopback" in IPv6 is not a winnable game.
  //
  // So: the only globally routable IPv6 is 2000::/3. Everything outside it is
  // special-purpose by IANA assignment and cannot be a district's SIS host.
  // One rule, and every encoding above is refused by construction rather than
  // by having been thought of.
  const v6 = address.toLowerCase().split('%')[0]; // drop any zone id (fe80::1%eth0)
  const head = parseInt(v6.split(':')[0], 16); // NaN for '::1', '::ffff:…' — refused
  if (!(head >= 0x2000 && head <= 0x3fff)) return true;

  // The two IPv4-embedding tunnels that live INSIDE global unicast, and so are
  // the only ways back through the rule above. Both are effectively dead
  // (RFC 7526 withdrew the 6to4 relay); refusing them outright is simpler and
  // safer than decoding the address they carry.
  const second = parseInt(v6.split(':')[1] || '0', 16);
  if (head === 0x2002) return true; // 6to4
  if (head === 0x2001 && second === 0) return true; // Teredo, 2001::/32

  return false;
}

/**
 * Resolve the host and refuse anything that lands inside a private network.
 *
 * Checks EVERY address the name resolves to, not just the first: a name with
 * one public and one private A record would otherwise pass and then be dialled
 * at whichever the resolver picked.
 */
export async function assertPublicSisHost(hostname: string, labels: SisUrlLabels): Promise<void> {
  assertPublicSisHostSyntax(hostname, labels);

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error(
      `We couldn't find ${hostname}. Check the address — it should look like ${labels.example}`,
    );
  }

  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address, a.family))) {
    throw new Error(
      `That address resolves to a private network address, so Speddy cannot use it. ${labels.product} needs to be reachable over the public internet.`,
    );
  }
}

/**
 * The whole question — "is it safe to send a district's certificate here?" —
 * answered in one place: scheme, then host syntax, then resolved addresses.
 *
 * The scheme belongs here rather than only at the write paths. Both of those
 * already refuse http:// (`normalizeAeriesBaseUrl` for the district's own form,
 * a zod refine on /api/internal/sis-connections), so nothing can store one
 * today — the table is empty and there is no third writer. But this is the last
 * point before the AERIES-CERT header goes on the wire, and it is the only one
 * that sees the URL a probe will actually dial rather than the one someone
 * typed. A future writer, a restored backup, or a hand-edited row would all
 * arrive here and nowhere else.
 *
 * Callers get one function so the two halves cannot drift apart, and so a test
 * that stubs the guard stubs all of it rather than silently keeping half.
 */
export async function assertSafeSisUrl(baseUrl: string, labels: SisUrlLabels): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      `That does not look like a web address. It should look like ${labels.example}`,
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `The ${labels.product} address must start with https:// so credentials stay encrypted.`,
    );
  }

  await assertPublicSisHost(parsed.hostname, labels);
}
