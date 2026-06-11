/**
 * Unit tests for the AI kill-switch in `withRoute` (SPE-162).
 *
 * Contract: a route with `aiGated: true` must 404 *before* any auth/client or
 * handler logic runs whenever `AI_FEATURES_ENABLED !== 'true'`, and must leave
 * non-gated routes untouched.
 */
import { NextRequest, NextResponse } from 'next/server';

// Mock the Supabase server client so we can assert whether the auth/client step
// ran, without hitting a real backend. (jest requires factory-referenced vars to
// be prefixed with `mock`.)
const mockGetUser = jest.fn();
const mockCreateClient = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

import { withRoute } from '@/lib/api/with-route';

const makeRequest = () =>
  new NextRequest('http://localhost/api/test', { method: 'POST' });

describe('withRoute AI kill-switch (aiGated)', () => {
  const original = process.env.AI_FEATURES_ENABLED;

  beforeEach(() => {
    mockCreateClient.mockReset();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockCreateClient.mockResolvedValue({ auth: { getUser: mockGetUser } });
  });

  afterEach(() => {
    if (original === undefined) delete process.env.AI_FEATURES_ENABLED;
    else process.env.AI_FEATURES_ENABLED = original;
  });

  it('404s a gated route and skips auth + handler when AI is disabled', async () => {
    delete process.env.AI_FEATURES_ENABLED;
    const handler = jest.fn();
    const route = withRoute({ aiGated: true }, handler as any);

    const res = await route(makeRequest());

    expect(res.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
    // The gate must short-circuit before the auth/client step.
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('treats any value other than "true" as disabled', async () => {
    process.env.AI_FEATURES_ENABLED = 'false';
    const handler = jest.fn();
    const route = withRoute({ aiGated: true }, handler as any);

    const res = await route(makeRequest());

    expect(res.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs auth + handler on a gated route when AI is enabled', async () => {
    process.env.AI_FEATURES_ENABLED = 'true';
    const handler = jest.fn(async () => NextResponse.json({ ok: true }));
    const route = withRoute({ aiGated: true }, handler as any);

    const res = await route(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCreateClient).toHaveBeenCalledTimes(1); // auth/client step ran
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not gate routes that opt out of aiGated', async () => {
    delete process.env.AI_FEATURES_ENABLED;
    const handler = jest.fn(async () => NextResponse.json({ ok: true }));
    const route = withRoute({ auth: false }, handler as any);

    const res = await route(makeRequest());

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
