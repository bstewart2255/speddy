import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRoute } from '@/lib/api/with-route';
import { isAdminForSchool } from '@/lib/api/admin-authz';

const log = logger.child({ module: 'admin-care-referral-delete' });

/**
 * DELETE /api/admin/care-referrals/[referralId]
 *
 * SPE-143: the "admin-confirmed CARE" step of a student deletion. CARE referrals
 * are linked to a student only by free-text name, so they are surfaced (not
 * auto-deleted) by the student-delete route and removed here once the admin
 * confirms. Deleting the referral cascades its case, meeting notes, action items,
 * and status history (all ON DELETE CASCADE from care_referrals / care_cases).
 *
 * Authorized for any admin over the referral's school. The delete runs with the
 * service role after the scope check so it also covers the district-admin-over-a-
 * different-school case that the table's own RLS delete policy does not.
 */
export const DELETE = withRoute<{ referralId: string }>({}, async ({ userId, params }) => {
  const { referralId } = params;

  const service = createServiceClient();

  const { data: referral, error } = await service
    .from('care_referrals')
    .select('id, school_id, student_name')
    .eq('id', referralId)
    .single();

  if (error || !referral) {
    return NextResponse.json({ error: 'CARE referral not found' }, { status: 404 });
  }

  const rls = await createClient();
  if (!referral.school_id || !(await isAdminForSchool(rls, userId, referral.school_id))) {
    return NextResponse.json(
      { error: 'You do not have permission to delete this CARE referral' },
      { status: 403 }
    );
  }

  const { error: delErr } = await service.from('care_referrals').delete().eq('id', referralId);
  if (delErr) {
    log.error('Failed to delete CARE referral', delErr);
    return NextResponse.json({ error: 'Failed to delete CARE referral' }, { status: 500 });
  }

  log.info('CARE referral deleted by admin', { referralId, deletedBy: userId });
  return NextResponse.json({ success: true });
});
