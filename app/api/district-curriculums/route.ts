import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRoute } from '@/lib/api/with-route';

const log = logger.child({ module: 'district-curriculums' });

/**
 * GET /api/district-curriculums
 * The curriculum ids the caller's district has enabled (SPE-422) — what the
 * session/group curriculum pickers offer. Empty until a district admin
 * configures the list. Runs on the user client so the table's RLS SELECT
 * policy (district members only) is what actually scopes the read.
 */
export const GET = withRoute({}, async ({ userId }) => {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('district_id')
    .eq('id', userId)
    .single();

  if (profileError) {
    log.error('Failed to read profile', { userId, error: profileError.message });
    return NextResponse.json({ error: 'Failed to load curriculums' }, { status: 500 });
  }

  if (!profile?.district_id) {
    // Legacy accounts predating the profiles.district_id backfill (the
    // "migration-in-progress" in ARCHITECTURE §3) can't be scoped to a
    // district list. Say so explicitly — the modal shows an account-linkage
    // note instead of wrongly claiming the district hasn't configured one.
    return NextResponse.json({ curriculumIds: [], districtLinked: false });
  }

  const { data, error } = await supabase
    .from('district_curriculums')
    .select('curriculum_id')
    .eq('district_id', profile.district_id);

  if (error) {
    log.error('Failed to read district curriculums', {
      userId,
      districtId: profile.district_id,
      error: error.message,
    });
    return NextResponse.json({ error: 'Failed to load curriculums' }, { status: 500 });
  }

  return NextResponse.json({
    curriculumIds: ((data ?? []) as { curriculum_id: string }[]).map((r) => r.curriculum_id),
    districtLinked: true,
  });
});
