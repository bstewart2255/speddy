/**
 * SPE-396 · resolveDistrictSisCaller — who may write a SIS credential.
 *
 * This decides who can store a district's SIS certificate and who can make our
 * servers probe a district's SIS. It had no tests; review flagged that, and it
 * is the right call for an authorization primitive whose failure modes are all
 * silent.
 *
 * The branch that matters most is the multi-district one. Picking a district
 * for a caller who holds several grants would write one district's credential
 * into another district's row, and nothing downstream would notice.
 */
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockNot = jest.fn();
let result: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        // `.eq()` is RECORDED, not ignored. Without this the suite passes even
        // if `.eq('admin_id', userId)` is dropped — and that regression returns
        // another administrator's grants, which is the whole thing this
        // function exists to prevent.
        eq: (...e: unknown[]) => {
          mockEq(...e);
          return {
            in: (...a: unknown[]) => {
              mockIn(...a);
              return {
                not: (...b: unknown[]) => {
                  mockNot(...b);
                  return Promise.resolve(result);
                },
              };
            },
          };
        },
      }),
    }),
  }),
}));

import { resolveDistrictSisCaller } from '@/lib/api/district-sis-caller';

const USER = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  result = { data: [], error: null };
});

describe('resolveDistrictSisCaller', () => {
  it('refuses an empty user id without querying', async () => {
    await expect(resolveDistrictSisCaller('')).resolves.toEqual({
      ok: false,
      denied: 'no authenticated user',
    });
    expect(mockIn).not.toHaveBeenCalled();
  });

  it('refuses when the permission lookup itself fails', async () => {
    // Fail closed: a database hiccup must not read as "allowed".
    result = { data: null, error: { message: 'connection reset' } };
    const r = await resolveDistrictSisCaller(USER);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.denied).toMatch(/lookup failed/);
  });

  it('refuses a caller with no district grant', async () => {
    result = { data: [], error: null };
    const r = await resolveDistrictSisCaller(USER);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.denied).toMatch(/no district_tech or district_admin/);
  });

  it('resolves a district_tech to their district', async () => {
    result = { data: [{ district_id: 'SIM-D001', role: 'district_tech' }], error: null };
    await expect(resolveDistrictSisCaller(USER)).resolves.toEqual({
      ok: true,
      districtId: 'SIM-D001',
      role: 'district_tech',
    });
  });

  it('resolves a district_admin too', async () => {
    result = { data: [{ district_id: 'SIM-D001', role: 'district_admin' }], error: null };
    await expect(resolveDistrictSisCaller(USER)).resolves.toEqual({
      ok: true,
      districtId: 'SIM-D001',
      role: 'district_admin',
    });
  });

  it('prefers the tech role when the caller holds both in one district', async () => {
    result = {
      data: [
        { district_id: 'SIM-D001', role: 'district_admin' },
        { district_id: 'SIM-D001', role: 'district_tech' },
      ],
      error: null,
    };
    const r = await resolveDistrictSisCaller(USER);
    expect(r).toEqual({ ok: true, districtId: 'SIM-D001', role: 'district_tech' });
  });

  it('refuses rather than guessing when grants span several districts', async () => {
    // The one that would be silent: picking either would write this district's
    // certificate into the other district's connection row.
    result = {
      data: [
        { district_id: 'SIM-D001', role: 'district_admin' },
        { district_id: '0618990', role: 'district_admin' },
      ],
      error: null,
    };
    const r = await resolveDistrictSisCaller(USER);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.denied).toMatch(/2 districts/);
  });

  it('scopes the lookup to the CALLER, not just to the roles', async () => {
    result = { data: [{ district_id: 'SIM-D001', role: 'district_tech' }], error: null };
    await resolveDistrictSisCaller(USER);
    // The predicate that keeps one admin from resolving another's grants.
    expect(mockEq).toHaveBeenCalledWith('admin_id', USER);
  });

  it('only ever asks for the two roles that may manage SIS connections', async () => {
    result = { data: [{ district_id: 'SIM-D001', role: 'district_tech' }], error: null };
    await resolveDistrictSisCaller(USER);
    // Pinned so widening the query is a deliberate act: adding a role here
    // would silently hand SIS credential access to that role.
    expect(mockIn).toHaveBeenCalledWith('role', ['district_tech', 'district_admin']);
    expect(mockNot).toHaveBeenCalledWith('district_id', 'is', null);
  });
});
