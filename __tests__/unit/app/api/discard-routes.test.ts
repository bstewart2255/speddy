/**
 * PATCH /api/exit-tickets/[id]/discard and /api/progress-check/[id]/discard
 * (SPE-77) — the discard toggles must not report a database failure as a 404.
 *
 * Both routes read the row with `.single()` before toggling. `.single()` signals
 * "no rows" as the PostgREST error code PGRST116, so the two failure modes
 * arrive on the same channel and used to collapse into one 404. That hid real
 * read failures from anyone reading logs or status codes.
 *
 * What these tests pin:
 *   - a genuine read error (any code that isn't PGRST116) is a 500, not a 404 —
 *     asserted on the code, so a future refactor that drops the discriminator
 *     and returns 404 for everything fails here;
 *   - PGRST116 with no row is still a 404, i.e. fixing the above didn't turn
 *     legitimate not-found into a server error;
 *   - the happy path still toggles and returns the updated row, so the added
 *     branch didn't change the success contract.
 */
import { NextRequest } from 'next/server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ROW_ID = '22222222-2222-4222-8222-222222222222';

type Result = { data: unknown; error: unknown };

let fetchResult: Result = { data: { id: ROW_ID, discarded_at: null, provider_id: USER_ID }, error: null };
let updateResult: Result = { data: { id: ROW_ID, discarded_at: '2026-08-14T00:00:00.000Z' }, error: null };

// The routes chain .select().eq().single() to read and
// .update().eq().select().single() to write. One self-returning query object
// serves both; which result it yields depends on whether .update() was called.
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: () => {
      let updating = false;
      const query: Record<string, unknown> = {};
      Object.assign(query, {
        select: () => query,
        eq: () => query,
        update: () => {
          updating = true;
          return query;
        },
        single: async () => (updating ? updateResult : fetchResult),
      });
      return query;
    },
  }),
}));

jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { PATCH as discardExitTicket } from '@/app/api/exit-tickets/[id]/discard/route';
import { PATCH as discardProgressCheck } from '@/app/api/progress-check/[id]/discard/route';

const routes = [
  { name: 'exit-tickets', handler: discardExitTicket, path: 'exit-tickets', notFound: 'Exit ticket not found' },
  { name: 'progress-check', handler: discardProgressCheck, path: 'progress-check', notFound: 'Progress check not found' },
] as const;

const call = (handler: (typeof routes)[number]['handler'], path: string) =>
  handler(
    new NextRequest(`http://localhost/api/${path}/${ROW_ID}/discard`, { method: 'PATCH' }),
    { params: Promise.resolve({ id: ROW_ID }) }
  );

describe.each(routes)('PATCH /api/$name/[id]/discard (SPE-77)', ({ handler, path, notFound }) => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchResult = { data: { id: ROW_ID, discarded_at: null, provider_id: USER_ID }, error: null };
    updateResult = { data: { id: ROW_ID, discarded_at: '2026-08-14T00:00:00.000Z' }, error: null };
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns 500 when the read fails for a reason other than "no rows"', async () => {
    fetchResult = {
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    };

    const res = await call(handler, path);

    expect(res.status).toBe(500);
    // Assert on the payload too: a 500 that says "not found" would still be
    // misleading to whoever reads it.
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/Failed to fetch/i) });
  });

  it('still returns 404 when the row genuinely does not exist (PGRST116)', async () => {
    fetchResult = {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    };

    const res = await call(handler, path);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: notFound });
  });

  it('toggles and returns the updated row on the happy path', async () => {
    const res = await call(handler, path);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      message: expect.stringMatching(/discarded/i),
    });
  });
});
