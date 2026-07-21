/**
 * SPE-288: reconcileStaleConflictsForProvider clears a flag ONLY when the FULL validation
 * passes. Guards the blocker all three reviewers (Codex, CodeRabbit, deep self-review)
 * caught in the first cut: has_conflict is a GENERIC flag, so a bell-schedule / special-
 * activity / rule-violation flag (validateSessionMove -> invalid) must be PRESERVED, not
 * wiped, on schedule view. Also covers the fail-safe (re-validation throws -> keep) and the
 * batched clear.
 */
import type { ScheduleSession } from '@/src/types';

// Configurable Supabase stub. The flagged SELECT resolves to `state.flagged`; the batched
// clear (`.update(...).in('id', ids).select('id')`) records the cleared ids in `state.updated`
// and echoes them back as rows so `cleared` reflects the count.
const state: { flagged: unknown[]; updated: string[] } = { flagged: [], updated: [] };

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      let mode: 'select' | 'update' = 'select';
      let inIds: string[] = [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: () => { mode = 'update'; return builder; },
        eq: () => builder,
        is: () => builder,
        not: () => builder,
        limit: () => builder,
        in: (_col: string, vals: string[]) => { inIds = vals; return builder; },
        then: (resolve: (r: unknown) => unknown) => {
          if (mode === 'update') {
            state.updated.push(...inIds);
            return resolve({ data: inIds.map(id => ({ id })), error: null });
          }
          return resolve({ data: state.flagged, error: null });
        },
      };
      return builder;
    },
  }),
}));

import { SessionUpdateService, type ValidationResult } from '@/lib/services/session-update-service';

const tmpl = (id: string): ScheduleSession => ({
  id,
  student_id: `stu-${id}`,
  provider_id: 'prov-1',
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '09:30:00',
  session_date: null,
  has_conflict: true,
  status: 'needs_attention',
} as unknown as ScheduleSession);

describe('reconcileStaleConflictsForProvider (SPE-288)', () => {
  beforeEach(() => {
    state.flagged = [];
    state.updated = [];
    jest.restoreAllMocks();
  });

  it('clears a fully-valid flag but PRESERVES a still-invalid (e.g. bell/activity) flag', async () => {
    state.flagged = [tmpl('valid'), tmpl('bell')];
    const svc = new SessionUpdateService();
    jest.spyOn(svc, 'validateSessionMove').mockImplementation(async (params): Promise<ValidationResult> =>
      params.session.id === 'valid'
        ? { valid: true }
        : { valid: false, error: 'Conflicts with Recess', conflicts: [{ type: 'bell_schedule', description: 'Conflicts with Recess' }] },
    );

    const { cleared } = await svc.reconcileStaleConflictsForProvider('prov-1');

    expect(cleared).toBe(1);
    expect(state.updated).toEqual(['valid']); // 'bell' flag left intact
  });

  it('fails safe: keeps the flag when re-validation throws', async () => {
    state.flagged = [tmpl('boom')];
    const svc = new SessionUpdateService();
    jest.spyOn(svc, 'validateSessionMove').mockRejectedValue(new Error('network'));

    const { cleared } = await svc.reconcileStaleConflictsForProvider('prov-1');

    expect(cleared).toBe(0);
    expect(state.updated).toEqual([]);
  });

  it('no-ops (no validation, no write) when there are no flagged sessions', async () => {
    state.flagged = [];
    const svc = new SessionUpdateService();
    const spy = jest.spyOn(svc, 'validateSessionMove');

    const { cleared } = await svc.reconcileStaleConflictsForProvider('prov-1');

    expect(cleared).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(state.updated).toEqual([]);
  });

  it('clears multiple valid flags in a single batched update', async () => {
    state.flagged = [tmpl('a'), tmpl('b'), tmpl('c')];
    const svc = new SessionUpdateService();
    jest.spyOn(svc, 'validateSessionMove').mockResolvedValue({ valid: true });

    const { cleared } = await svc.reconcileStaleConflictsForProvider('prov-1');

    expect(cleared).toBe(3);
    expect(state.updated).toEqual(['a', 'b', 'c']);
  });
});
