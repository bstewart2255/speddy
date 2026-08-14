/**
 * GET /api/features (SPE-494) — reports which flag-gated features are on so
 * client surfaces can hide dead entry points. Pins that the flag is read per
 * request (a flip takes effect without a restart) and that the route answers
 * while the AI switch is OFF — that is the whole point of it.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
        error: null,
      }),
    },
  }),
}));

jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET } from '@/app/api/features/route';

const makeRequest = () => new NextRequest('http://localhost/api/features');

describe('GET /api/features', () => {
  const ORIGINAL_FLAG = process.env.AI_FEATURES_ENABLED;

  beforeEach(() => {
    delete process.env.AI_FEATURES_ENABLED;
  });

  afterAll(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.AI_FEATURES_ENABLED;
    else process.env.AI_FEATURES_ENABLED = ORIGINAL_FLAG;
  });

  it('reports aiFeatures false while the switch is off', async () => {
    const res = await GET(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ aiFeatures: false });
  });

  it('reports aiFeatures true when the switch is on, per request', async () => {
    let res = await GET(makeRequest(), { params: Promise.resolve({}) });
    expect((await res.json()).aiFeatures).toBe(false);

    process.env.AI_FEATURES_ENABLED = 'true';
    res = await GET(makeRequest(), { params: Promise.resolve({}) });
    expect((await res.json()).aiFeatures).toBe(true);
  });

  it('treats anything but the literal "true" as off', async () => {
    process.env.AI_FEATURES_ENABLED = '1';
    const res = await GET(makeRequest(), { params: Promise.resolve({}) });
    expect((await res.json()).aiFeatures).toBe(false);
  });
});
