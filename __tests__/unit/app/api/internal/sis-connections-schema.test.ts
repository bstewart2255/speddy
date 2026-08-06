/**
 * SPE-396 · /api/internal/sis-connections must not accept an http:// base.
 *
 * This route is the only way an http:// SIS address can reach the table — the
 * district-facing path normalizes through `normalizeAeriesBaseUrl`, which
 * refuses one. A stored http:// base is not an SSRF problem; it is a credential
 * problem, because every probe against that row would send the district's SIS
 * certificate in cleartext.
 *
 * The real schema is imported rather than reconstructed here. A local copy
 * would keep passing after someone deleted the constraint from the route.
 */
import { createSisConnectionBody } from '@/app/api/internal/sis-connections/route';

const valid = { districtId: 'SIM-D001', sisType: 'aeries' as const };

describe('createSisConnectionBody', () => {
  it('accepts an https base and token url', () => {
    const r = createSisConnectionBody.safeParse({
      ...valid,
      baseUrl: 'https://demo.aeries.net/aeries/api/v5',
      tokenUrl: 'https://demo.aeries.net/token',
    });
    expect(r.success).toBe(true);
  });

  it('accepts the row with neither url — both are optional', () => {
    expect(createSisConnectionBody.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['baseUrl', { baseUrl: 'http://demo.aeries.net/aeries/api/v5' }],
    ['tokenUrl', { tokenUrl: 'http://demo.aeries.net/token' }],
  ])('refuses an http:// %s', (field, patch) => {
    const r = createSisConnectionBody.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    // Assert WHY it was refused. `.url()` rejects plenty of strings on its own,
    // so "it failed" would stay green with the https constraint deleted.
    expect(r.success === false && JSON.stringify(r.error.issues)).toContain(
      `${field} must start with https://`,
    );
  });

  it('still refuses a string that is not a url at all', () => {
    const r = createSisConnectionBody.safeParse({ ...valid, baseUrl: 'not a url' });
    expect(r.success).toBe(false);
  });
});
