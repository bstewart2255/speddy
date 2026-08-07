import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { withRoute } from '@/lib/api/with-route';
import { isKnownCurriculumId } from '@/lib/curriculums/catalog';

const log = logger.child({ module: 'district-admin-curriculums' });

/**
 * Resolve the caller's district_admin grant. Multi-district admins are legal
 * (see site-admin route); like the schools page, this surface operates on a
 * single grant. Ordered so GET and PUT — which resolve independently — always
 * land on the SAME district; an unordered limit(1) could load one district's
 * list and save the edits to another (Codex, PR #817).
 */
async function getAdminDistrictId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('admin_permissions')
    .select('district_id')
    .eq('admin_id', userId)
    .eq('role', 'district_admin')
    .not('district_id', 'is', null)
    .order('district_id', { ascending: true })
    .limit(1);

  if (error) {
    log.error('Failed to read admin permissions', { userId, error: error.message });
    return null;
  }
  return data?.[0]?.district_id ?? null;
}

/**
 * GET /api/admin/district/curriculums
 * The curriculum ids currently enabled for the caller's district.
 */
export const GET = withRoute({}, async ({ userId }) => {
  const districtId = await getAdminDistrictId(userId);
  if (!districtId) {
    return NextResponse.json(
      { error: 'Forbidden: District admin access required' },
      { status: 403 }
    );
  }

  // User client on purpose: reads go through the RLS SELECT policy's
  // district-admin branch, so this request also proves the policy works.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('district_curriculums')
    .select('curriculum_id')
    .eq('district_id', districtId);

  if (error) {
    log.error('Failed to read district curriculums', { userId, districtId, error: error.message });
    return NextResponse.json({ error: 'Failed to load curriculums' }, { status: 500 });
  }

  return NextResponse.json({
    districtId,
    curriculumIds: ((data ?? []) as { curriculum_id: string }[]).map((r) => r.curriculum_id),
  });
});

const putSchema = z.object({
  // The catalog is ~30 entries; 100 leaves headroom without accepting abuse.
  curriculumIds: z.array(z.string().min(1).max(64)).max(100),
});

/**
 * PUT /api/admin/district/curriculums
 * Replace the district's enabled-curriculum set with the given catalog ids.
 */
export const PUT = withRoute({ body: putSchema }, async ({ userId, body }) => {
  const districtId = await getAdminDistrictId(userId);
  if (!districtId) {
    return NextResponse.json(
      { error: 'Forbidden: District admin access required' },
      { status: 403 }
    );
  }

  const requested = [...new Set(body.curriculumIds)];
  const unknown = requested.filter((id) => !isKnownCurriculumId(id));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown curriculum ids: ${unknown.join(', ')}` },
      { status: 400 }
    );
  }

  // Browser sessions hold no write grant on this table (see the SPE-422
  // migration); mutations run here with the service role after the
  // district_admin check above.
  const serviceClient = createServiceClient();

  // Two statements, so not atomic — ordered add-then-prune on purpose: if the
  // prune fails mid-flight, the district temporarily shows extra curriculums
  // and a retried save heals it, whereas prune-then-add could drop the admin's
  // picks while the UI reports failure (Codex, PR #817). Upsert (not insert)
  // so rows that stay enabled keep their created_at/created_by provenance.
  if (requested.length > 0) {
    const { error: upsertError } = await serviceClient.from('district_curriculums').upsert(
      requested.map((curriculumId) => ({
        district_id: districtId,
        curriculum_id: curriculumId,
        created_by: userId,
      })),
      { onConflict: 'district_id,curriculum_id', ignoreDuplicates: true }
    );

    if (upsertError) {
      log.error('Failed to add district curriculums', {
        userId,
        districtId,
        error: upsertError.message,
      });
      return NextResponse.json({ error: 'Failed to save curriculums' }, { status: 500 });
    }
  }

  let pruneQuery = serviceClient
    .from('district_curriculums')
    .delete()
    .eq('district_id', districtId);
  if (requested.length > 0) {
    pruneQuery = pruneQuery.not('curriculum_id', 'in', `(${requested.join(',')})`);
  }
  const { error: deleteError } = await pruneQuery;

  if (deleteError) {
    log.error('Failed to remove district curriculums', {
      userId,
      districtId,
      error: deleteError.message,
    });
    return NextResponse.json({ error: 'Failed to save curriculums' }, { status: 500 });
  }

  log.info('District curriculums updated', {
    userId,
    districtId,
    count: requested.length,
  });

  return NextResponse.json({ districtId, curriculumIds: requested });
});
