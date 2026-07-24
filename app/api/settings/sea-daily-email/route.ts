import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';
import { log } from '@/lib/monitoring/logger';
import {
  resourceSchoolKeys,
  seaSharesResourceSchool,
} from '@/lib/settings/sea-daily-email';

// SPE-320: a resource specialist toggles daily schedule emails for an SEA at
// their school. The SEA's own Settings toggle reflects this change.
//
// All authorization is server-side and never trusts client-supplied school
// values: caller must be `resource`, target must be `sea`, and they must share
// a school (site + district). The cross-profile write uses the service client
// because RLS (correctly) forbids writing another user's profile — that policy
// is NOT loosened for this.

const bodySchema = z.object({
  seaId: z.string().uuid(),
  enabled: z.boolean(),
});

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });

export const POST = withRoute({ body: bodySchema }, async ({ userId, body }) => {
  const { seaId, enabled } = body;
  const admin = createServiceClient();

  // Caller must be a resource specialist.
  const { data: caller, error: callerErr } = await admin
    .from('profiles')
    .select('id, role, school_site, school_district, works_at_multiple_schools')
    .eq('id', userId)
    .single();
  if (callerErr || !caller || caller.role !== 'resource') {
    return forbidden();
  }

  // Target must be an SEA.
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, role, school_site, school_district')
    .eq('id', seaId)
    .single();
  if (targetErr || !target || target.role !== 'sea') {
    return forbidden();
  }

  // Shared school (site + district) — same rule as the Settings UI.
  const { data: providerSchools } = await admin
    .from('provider_schools')
    .select('school_site, school_district')
    .eq('provider_id', userId);

  const keys = resourceSchoolKeys({
    worksAtMultipleSchools: caller.works_at_multiple_schools,
    schoolSite: caller.school_site,
    schoolDistrict: caller.school_district,
    providerSchools: providerSchools ?? [],
  });

  if (!seaSharesResourceSchool(target, keys)) {
    return forbidden();
  }

  // Cross-profile write via the service client. The extra role='sea' predicate
  // is defense-in-depth so a race can never flip a non-SEA row.
  const { data: updated, error: updateErr } = await admin
    .from('profiles')
    .update({ daily_schedule_email_enabled: enabled })
    .eq('id', seaId)
    .eq('role', 'sea')
    .select('id, daily_schedule_email_enabled')
    .single();

  if (updateErr || !updated) {
    log.error('Failed to update SEA daily-email preference', updateErr, { userId, seaId });
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }

  return NextResponse.json({
    seaId: updated.id,
    enabled: updated.daily_schedule_email_enabled,
  });
});
