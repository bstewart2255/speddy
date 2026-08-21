/**
 * SPE-592 · "Has this district ever actually published a roster?"
 *
 * The whole reason this is not just "is there a newest audit row": a publish
 * that DIED still writes `district_roster_imported`, marked `partial: true`.
 * Production holds one reading `{created: 0, updated: 0, partial: true}`.
 * Counting it would tell the page the district has a roster, which collapses
 * the uploader on the one admin who just failed to use it.
 *
 * All data is fictional, though the metadata shapes are the ones production
 * actually wrote.
 */

let rows: { timestamp: unknown; metadata: unknown }[] = [];
let readError: { message: string } | null = null;

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.limit = () => Promise.resolve({ data: readError ? null : rows, error: readError });
      return q;
    },
  }),
}));

jest.mock('@/lib/logger', () => {
  const noop = () => {};
  const fake = { info: noop, warn: noop, error: noop, debug: noop, child: () => fake };
  return { logger: fake };
});

import { loadLastPublishedAt } from '@/lib/district-roster/gaps-io';

const DISTRICT_ID = '0618990';

const attempt = (timestamp: string, metadata: Record<string, unknown>) => ({
  timestamp,
  metadata: { districtId: DISTRICT_ID, ...metadata },
});

beforeEach(() => {
  rows = [];
  readError = null;
});

describe('loadLastPublishedAt', () => {
  it('returns the newest clean publish', async () => {
    rows = [
      attempt('2026-08-21T18:45:36Z', { partial: false, created: 6, updated: 1 }),
      attempt('2026-08-21T17:59:34Z', { partial: false, created: 56, updated: 171 }),
    ];

    await expect(loadLastPublishedAt(DISTRICT_ID)).resolves.toBe('2026-08-21T18:45:36Z');
  });

  it('skips a publish that died before writing anything', async () => {
    rows = [
      attempt('2026-08-21T00:22:04Z', { partial: true, created: 0, updated: 0 }),
      attempt('2026-08-20T09:10:00Z', { partial: false, created: 59, updated: 173 }),
    ];

    await expect(loadLastPublishedAt(DISTRICT_ID)).resolves.toBe('2026-08-20T09:10:00Z');
  });

  it('counts a partial publish that DID write students', async () => {
    // Those students are on the roster and the gaps list is about to discuss
    // them; calling that "never published" would be its own lie.
    rows = [attempt('2026-08-21T00:37:27Z', { partial: true, created: 59, updated: 0 })];

    await expect(loadLastPublishedAt(DISTRICT_ID)).resolves.toBe('2026-08-21T00:37:27Z');
  });

  it('reports never-published when every attempt failed outright', async () => {
    rows = [
      attempt('2026-08-21T00:22:04Z', { partial: true, created: 0, updated: 0 }),
      attempt('2026-08-21T00:19:00Z', { partial: true, created: 0, updated: 0 }),
    ];

    await expect(loadLastPublishedAt(DISTRICT_ID)).resolves.toBeNull();
  });

  it('reports never-published for a district with no attempts at all', async () => {
    await expect(loadLastPublishedAt(DISTRICT_ID)).resolves.toBeNull();
  });

  it('treats a row with no partial flag as a publish', async () => {
    // Older rows predate the flag; absence is not evidence of failure.
    rows = [attempt('2026-08-19T12:00:00Z', { created: 12, updated: 3 })];

    await expect(loadLastPublishedAt(DISTRICT_ID)).resolves.toBe('2026-08-19T12:00:00Z');
  });

  it('answers null rather than throwing when the history cannot be read', async () => {
    // The gaps themselves are what the page is for — a missing "last published"
    // line beats an empty page.
    readError = { message: 'audit_logs unavailable' };

    await expect(loadLastPublishedAt(DISTRICT_ID)).resolves.toBeNull();
  });
});
