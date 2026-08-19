import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSpecialistSourceRole } from '@/lib/auth/role-utils';

/**
 * "Does this caller hold a caseload?" — the admission for surfaces that serve
 * student PII to a SERVICE PROVIDER specifically (SPE-447 slice 2).
 *
 * Authentication is not enough for these. The roster surfaces read `children`
 * with the service client, because an unclaimed child is invisible through RLS
 * by construction — so RLS cannot be what narrows the answer, and the school
 * scope alone will not do it either: `user_accessible_school_ids()` answers for
 * teachers, SEAs and site admins too. Without this check, any signed-in
 * teacher at the school would receive full names, district student ids and IEP
 * dates for every unserved student on the district's roster.
 *
 * Deliberately the SAME role set `claim_roster_children` enforces in the
 * database, derived from SPECIALIST_SOURCE_ROLES so a new provider role cannot
 * be added in one place and missed here.
 */
export type ProviderGateResult =
  | { ok: true; role: string }
  | { ok: false; response: NextResponse };

export async function requireProvider(userId: string): Promise<ProviderGateResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  // Fail closed. A profile that cannot be read is not a provider.
  if (error || !data || !isSpecialistSourceRole(String(data.role ?? ''))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: this is for service providers with a caseload.' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, role: String(data.role) };
}
