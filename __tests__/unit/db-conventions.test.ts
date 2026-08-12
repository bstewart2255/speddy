/**
 * SPE-441 — tests for the database hardening convention gate.
 *
 * Two jobs here:
 *
 *  1. Run the gate itself, so `npm test` (and therefore CI) fails on a migration
 *     that introduces a new violation. This is the enforcement the ticket asks
 *     for — no separate workflow step needed.
 *
 *  2. Pin the checker's own behaviour. A silently-broken linter is worse than no
 *     linter: it reports success forever and everyone trusts it. The cases below
 *     are the ones that would actually break it — SQL comments that quote the
 *     conventions (this repo has migrations whose comments literally read
 *     "TO authenticated, NOT public"), and dollar-quoted function bodies that
 *     contain policy-shaped text.
 */
import { scanFile, runCheck, keyOf } from '@/scripts/db-conventions/check';

describe('db conventions gate', () => {
  it('reports no newly introduced violations in supabase/migrations', () => {
    const { introduced } = runCheck();
    const detail = introduced.map((f) => `${f.file}:${f.line} ${f.detail}`).join('\n');
    expect(detail).toBe('');
    expect(introduced).toHaveLength(0);
  });

  it('has a baseline that still matches the tree', () => {
    // A stale entry means debt was cleared without pruning the baseline, which
    // would let the same violation be reintroduced unnoticed.
    const { staleBaselineKeys } = runCheck();
    expect(staleBaselineKeys).toEqual([]);
  });
});

describe('rule: search-path-pg-temp', () => {
  it('flags a SECURITY DEFINER function whose search_path omits pg_temp', () => {
    const sql = `CREATE OR REPLACE FUNCTION public.f(p uuid)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN RAISE NOTICE 'x'; END; $$;`;
    const found = scanFile(sql, 'm.sql');
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('search-path-pg-temp');
    expect(found[0].identifier).toBe('f');
  });

  it('flags a SECURITY DEFINER function with no search_path at all', () => {
    const sql = `CREATE FUNCTION public.g() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN END; $$;`;
    expect(scanFile(sql, 'm.sql')[0].detail).toMatch(/sets no search_path/);
  });

  it('accepts pg_temp listed last', () => {
    const sql = `CREATE FUNCTION public.h() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, auth, pg_temp AS $$ BEGIN END; $$;`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });

  it('flags pg_temp that is present but not last', () => {
    const sql = `CREATE FUNCTION public.i() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = pg_temp, public AS $$ BEGIN END; $$;`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(1);
  });

  it('ignores SECURITY INVOKER functions, which do not need the pin', () => {
    const sql = `CREATE FUNCTION public.j(a text[]) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT a $$;`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });
});

describe('rule: policy-explicit-role', () => {
  it('flags a policy with no TO clause (defaults to public, which includes anon)', () => {
    const sql = `CREATE POLICY p ON public.students FOR SELECT USING (provider_id = (SELECT auth.uid()));`;
    const found = scanFile(sql, 'm.sql');
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('policy-explicit-role');
  });

  it('accepts an explicit TO authenticated', () => {
    const sql = `CREATE POLICY p ON public.students FOR SELECT TO authenticated
      USING (provider_id = (SELECT auth.uid()));`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });

  it('does not accept a TO that appears only inside the USING expression', () => {
    const sql = `CREATE POLICY p ON public.students FOR SELECT
      USING (note = 'granted TO authenticated users' AND id = (SELECT auth.uid()));`;
    expect(scanFile(sql, 'm.sql').map((f) => f.rule)).toContain('policy-explicit-role');
  });
});

describe('rule: policy-inlined-auth-fn', () => {
  it('flags a bare auth.uid() call', () => {
    const sql = `CREATE POLICY p ON public.students FOR SELECT TO authenticated USING (provider_id = auth.uid());`;
    const found = scanFile(sql, 'm.sql');
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('policy-inlined-auth-fn');
  });

  it('accepts the wrapped form, including odd whitespace and casing', () => {
    const sql = `CREATE POLICY p ON public.students FOR SELECT TO authenticated
      USING ( provider_id = ( select   AUTH.UID( ) ) );`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });

  it('flags a second bare call even when the first is correctly wrapped', () => {
    const sql = `CREATE POLICY p ON public.students FOR SELECT TO authenticated
      USING (provider_id = (SELECT auth.uid()) AND owner_id = auth.uid());`;
    expect(scanFile(sql, 'm.sql').map((f) => f.rule)).toContain('policy-inlined-auth-fn');
  });
});

describe('parsing hazards', () => {
  it('is not fooled by SQL comments that quote the conventions', () => {
    // This shape is real: 20260806_spe394_profiles_select_district_scope.sql has
    // a comment reading "TO authenticated, NOT public" above a policy.
    const sql = `-- Remember: TO authenticated, and always (select auth.uid()), and pg_temp last.
      /* block comment: TO authenticated, pg_temp, (select auth.uid()) */
      CREATE POLICY p ON public.students FOR SELECT USING (provider_id = auth.uid());`;
    const rules = scanFile(sql, 'm.sql').map((f) => f.rule).sort();
    expect(rules).toEqual(['policy-explicit-role', 'policy-inlined-auth-fn']);
  });

  it('does not read policy-shaped text inside a function body as a policy', () => {
    const sql = `CREATE FUNCTION public.k() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp AS $$
      BEGIN
        EXECUTE 'CREATE POLICY inner_p ON public.t FOR SELECT USING (x = auth.uid())';
      END; $$;`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });

  it('does not split statements on semicolons inside a function body', () => {
    const sql = `CREATE FUNCTION public.l() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public AS $$
      BEGIN a := 1; b := 2; c := 3; END; $$;`;
    // One function, one finding — not one per internal semicolon.
    expect(scanFile(sql, 'm.sql')).toHaveLength(1);
  });

  it('does not read the "to" in a policy NAME as the TO clause', () => {
    // "Allow authenticated users to read X" is this repo's dominant naming
    // idiom. Searching the whole header for /\bto\b/ marked ~20 TO-less
    // policies compliant — the gate silently permitting what it exists to catch.
    const sql = `CREATE POLICY "Allow authenticated users to read states" ON public.states
      FOR SELECT USING (true);`;
    expect(scanFile(sql, 'm.sql').map((f) => f.rule)).toContain('policy-explicit-role');
  });

  it('rejects an explicit TO public or TO anon', () => {
    // Naming the unsafe role is the same exposure as defaulting to it.
    for (const role of ['public', 'anon']) {
      const sql = `CREATE POLICY p ON public.students FOR SELECT TO ${role}
        USING (id = (SELECT auth.uid()));`;
      const found = scanFile(sql, 'm.sql');
      expect(found.map((f) => f.rule)).toContain('policy-explicit-role');
      expect(found[0].detail).toMatch(/without signing in/);
    }
  });

  it('accepts service_role and other named roles', () => {
    const sql = `CREATE POLICY p ON public.students FOR SELECT TO service_role USING (true);`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });

  it('inspects every role in the TO list, not just the first', () => {
    // Codex, PR #849: a safe role in front must not hide an unsafe one behind
    // it. `TO authenticated, anon` is still reachable without signing in.
    const sql = `CREATE POLICY p ON public.students FOR SELECT TO authenticated, anon
      USING (id = (SELECT auth.uid()));`;
    const found = scanFile(sql, 'm.sql');
    expect(found.map((f) => f.rule)).toContain('policy-explicit-role');
    expect(found[0].detail).toMatch(/anon/);
  });

  it('accepts a multi-role list when every role is safe', () => {
    const sql = `CREATE POLICY p ON public.students FOR SELECT TO authenticated, service_role
      USING (id = (SELECT auth.uid()));`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });

  it('checks every policy in a DO block, not just the first', () => {
    // A compliant first policy used to launder every violating one behind it.
    const sql = `DO $$
      BEGIN
        EXECUTE 'CREATE POLICY good_one ON public.t FOR SELECT TO authenticated USING (a = (SELECT auth.uid()))';
        EXECUTE 'CREATE POLICY bad_one ON public.t FOR UPDATE USING (a = auth.uid())';
        EXECUTE 'CREATE POLICY bad_two ON public.t FOR DELETE USING (a = auth.uid())';
      END $$;`;
    const found = scanFile(sql, 'm.sql');
    const names = new Set(found.map((f) => f.identifier));
    expect(names).toEqual(new Set(['t.bad_one', 't.bad_two']));
    expect(found).toHaveLength(4); // each bad policy breaks both policy rules
  });

  it('accepts the deparsed (select auth.uid() as uid) form', () => {
    // What pg_policies returns, so what anyone copying from it will paste.
    const sql = `CREATE POLICY p ON public.students FOR SELECT TO authenticated
      USING (provider_id = (SELECT auth.uid() AS uid));`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });

  it('accepts attributes declared after the function body', () => {
    // Both orderings are legal and both appear in this repo; truncating at the
    // first dollar quote reported this correctly-pinned function as unpinned.
    const sql = `CREATE OR REPLACE FUNCTION public.after_body() RETURNS void AS $$
      BEGIN RAISE NOTICE 'x'; END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(0);
  });

  it('still flags an after-body function that omits pg_temp', () => {
    const sql = `CREATE OR REPLACE FUNCTION public.after_body_bad() RETURNS void AS $$
      BEGIN END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(1);
  });

  it('does not read a SET search_path written inside a body as the pin', () => {
    const sql = `CREATE FUNCTION public.decoy() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN EXECUTE 'SET search_path = public, pg_temp'; END; $$;`;
    expect(scanFile(sql, 'm.sql')[0].detail).toMatch(/sets no search_path/);
  });

  it('does not let an ALTER on one overload launder a different unpinned one', () => {
    // Codex, PR #849: f(text) is unpinned and f(integer) is pinned. Same name,
    // same arity — only the argument types tell them apart. The rule fails
    // closed rather than suppressing on a name match.
    const sql = `CREATE FUNCTION public.f(a text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN END; $$;
      ALTER FUNCTION public.f(integer) SET search_path = public, pg_temp;`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(1);
  });

  it('reports a CREATE pinned only by a following ALTER (documented, fails closed)', () => {
    // Deliberate: see the note on checkFunction. Write the pin into the CREATE,
    // or baseline it. Pinned here so the trade-off is a decision, not a drift.
    const sql = `CREATE FUNCTION public.later_pinned() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN END; $$;
      ALTER FUNCTION public.later_pinned() SET search_path = public, pg_temp;`;
    expect(scanFile(sql, 'm.sql')).toHaveLength(1);
  });

  it('keeps quoted identifiers containing spaces distinct', () => {
    // Collapsing these to a shared key would let one baseline entry mask the other.
    const sql = `CREATE POLICY "Admins can view staff hours" ON public.staff_hours FOR SELECT USING (a = auth.uid());
      CREATE POLICY "Admins can edit staff hours" ON public.staff_hours FOR UPDATE USING (a = auth.uid());`;
    const keys = new Set(scanFile(sql, 'm.sql').map(keyOf));
    expect(keys.size).toBe(4); // 2 policies × 2 rules
  });
});
