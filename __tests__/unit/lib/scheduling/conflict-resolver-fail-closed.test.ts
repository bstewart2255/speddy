// Aliased with a `mock` prefix so the jest.mock factory (hoisted above imports
// by babel-plugin-jest-hoist) may reference it.
import { createMockSupabaseClient as mockCreateSupabaseClient } from '@/test-utils/supabase-test-helpers';

// ConflictResolver builds a Supabase client in its constructor; stub the module
// so construction is harmless. Each test then overrides `resolver.supabase`.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateSupabaseClient(),
}));

import { ConflictResolver } from '@/lib/scheduling/conflict-resolver';

type QueryResponse = { data: any[] | null; error: any };

// Build a resolver whose cross-provider query resolves to `response`. The chain
// (.select().eq().eq().neq()) ends on `.neq()`, so every method returns the same
// thenable builder.
function resolverReturning(response: QueryResponse): ConflictResolver {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    then: (resolve: (r: QueryResponse) => unknown) => resolve(response),
  };
  const resolver = new ConflictResolver('provider-1') as any;
  resolver.supabase = { from: () => builder };
  return resolver as ConflictResolver;
}

// A resolver whose query throws synchronously, exercising the catch block.
function resolverThatThrows(): ConflictResolver {
  const resolver = new ConflictResolver('provider-1') as any;
  resolver.supabase = {
    from: () => {
      throw new Error('network down');
    },
  };
  return resolver as ConflictResolver;
}

const overlapping = {
  id: 'other-session',
  start_time: '09:00:00',
  end_time: '09:30:00',
  service_type: 'Speech',
  profiles: { full_name: 'Dr. Other', role: 'speech' },
};

// checkCrossProviderConflicts(studentId, schoolSite, dayOfWeek, start, end)
const args = ['student-1', 'Willow', 1, '09:15', '09:45'] as const;

describe('ConflictResolver.checkCrossProviderConflicts fails closed (SPE-141)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('treats a query error as a conflict rather than silently allowing a double-booking', async () => {
    const resolver = resolverReturning({ data: null, error: { message: 'boom' } });
    const result = await resolver.checkCrossProviderConflicts(...args);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictDetails).toMatch(/could not verify/i);
  });

  it('treats a thrown error as a conflict (catch block fails closed)', async () => {
    const resolver = resolverThatThrows();
    const result = await resolver.checkCrossProviderConflicts(...args);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictDetails).toMatch(/could not verify/i);
  });

  it('reports no conflict when the lookup succeeds with no overlapping session', async () => {
    const resolver = resolverReturning({ data: [], error: null });
    const result = await resolver.checkCrossProviderConflicts(...args);

    expect(result.hasConflict).toBe(false);
  });

  it('still reports a genuine overlap as a conflict', async () => {
    const resolver = resolverReturning({ data: [overlapping], error: null });
    const result = await resolver.checkCrossProviderConflicts(...args);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictDetails).toContain('Dr. Other');
  });

  it('reports the overlap without crashing when the provider profile is missing', async () => {
    // A deleted provider leaves `profiles` null on the joined row; the overlap
    // is still real, so it must surface as a conflict, not throw into the catch.
    const resolver = resolverReturning({
      data: [{ ...overlapping, profiles: null }],
      error: null,
    });
    const result = await resolver.checkCrossProviderConflicts(...args);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictDetails).toContain('another provider');
  });
});
