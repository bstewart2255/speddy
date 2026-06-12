import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRoute } from '@/lib/api/with-route';

const log = logger.child({ module: 'admin-provider-delete' });

/**
 * DELETE /api/admin/providers/[providerId]
 *
 * SPE-143: admin-initiated account deletion (sufficient for the admin-created-
 * accounts model). Deleting the profile cascades the provider's students and all
 * of their data; we then delete the Supabase Auth user. Because `profiles.id ->
 * auth.users.id` is ON DELETE NO ACTION (no cascade either direction), both
 * deletes are explicit and must run with the service role.
 *
 * Several other tables reference the provider via NO ACTION foreign keys:
 *   - Nullable references are nulled first so they don't block the delete.
 *   - NOT NULL provenance references that do NOT cascade (CARE referrals/notes/
 *     status changes the provider authored, school-year activations) are reported
 *     as blockers for the admin to reassign or remove first — we never silently
 *     rewrite authorship.
 *
 * Storage objects do not cascade, so provider-owned objects are removed explicitly.
 */
export const DELETE = withRoute<{ providerId: string }>({}, async ({ userId, params }) => {
  const { providerId } = params;

  if (providerId === userId) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: provider, error: provErr } = await service
    .from('profiles')
    .select('id, school_id, role, full_name')
    .eq('id', providerId)
    .single();

  if (provErr || !provider) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Authorization: a Speddy super-admin, or a district admin whose district(s)
  // cover EVERY school the provider serves. Deleting an account removes that
  // provider's data across all of their schools, so a single-school (site) admin
  // must not be able to trigger it (SPE-143 review).
  const rls = await createClient();
  const { data: me } = await rls
    .from('profiles')
    .select('is_speddy_admin')
    .eq('id', userId)
    .single();

  let allowed = me?.is_speddy_admin === true;

  if (!allowed) {
    // Every school the provider serves: their primary school plus provider_schools.
    const { data: provSchools } = await service
      .from('provider_schools')
      .select('school_id')
      .eq('provider_id', providerId);
    const providerSchoolIds = new Set<string>();
    if (provider.school_id) providerSchoolIds.add(provider.school_id);
    (provSchools ?? []).forEach((r) => r.school_id && providerSchoolIds.add(r.school_id));

    // The requester's district_admin districts (site admins cannot delete accounts).
    const { data: perms } = await rls
      .from('admin_permissions')
      .select('district_id')
      .eq('admin_id', userId)
      .eq('role', 'district_admin');
    const myDistrictIds = new Set((perms ?? []).map((p) => p.district_id).filter(Boolean));

    if (myDistrictIds.size > 0 && providerSchoolIds.size > 0) {
      const { data: schools } = await service
        .from('schools')
        .select('id, district_id')
        .in('id', Array.from(providerSchoolIds));
      // Allow only if every one of the provider's schools resolved and belongs to
      // one of the requester's districts.
      allowed =
        !!schools &&
        schools.length === providerSchoolIds.size &&
        schools.every((s) => myDistrictIds.has(s.district_id));
    }
  }

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "You do not have permission to delete this account. Account deletion requires a district admin covering all of the provider's schools, or a Speddy admin.",
      },
      { status: 403 }
    );
  }

  // --- Preflight: NOT NULL references that do not cascade would hard-block the delete. ---
  const blockerSpecs: Array<{ label: string; table: string; column: string }> = [
    { label: 'CARE referral(s) created', table: 'care_referrals', column: 'referring_user_id' },
    { label: 'CARE meeting note(s)', table: 'care_meeting_notes', column: 'created_by' },
    { label: 'CARE case status change(s)', table: 'care_case_status_history', column: 'changed_by' },
    { label: 'school year activation(s)', table: 'activated_school_years', column: 'activated_by' },
  ];

  const blockers: Array<{ label: string; count: number }> = [];
  for (const spec of blockerSpecs) {
    const { count } = await service
      .from(spec.table)
      .select('id', { count: 'exact', head: true })
      .eq(spec.column, providerId);
    if (count && count > 0) blockers.push({ label: spec.label, count });
  }

  if (blockers.length) {
    return NextResponse.json(
      {
        error: 'Account has records that must be reassigned or removed first',
        canDelete: false,
        blockerReason: blockers.map((b) => `${b.count} ${b.label}`).join(', '),
        dependencyCounts: blockers,
      },
      { status: 409 }
    );
  }

  // --- Collect provider-owned Storage paths BEFORE deleting (Storage never cascades). ---
  const { data: saved } = await service
    .from('saved_worksheets')
    .select('file_path')
    .eq('provider_id', providerId);
  const savedPaths = (saved ?? []).map((s) => s.file_path).filter((p): p is string => !!p);

  const { data: docs } = await service
    .from('documents')
    .select('file_path')
    .eq('created_by', providerId);
  const docPaths = (docs ?? []).map((d) => d.file_path).filter((p): p is string => !!p);

  const { data: provStudents } = await service
    .from('students')
    .select('id')
    .eq('provider_id', providerId);
  const studentIds = (provStudents ?? []).map((s) => s.id);

  let worksheetPaths: string[] = [];
  let submissionPaths: string[] = [];
  if (studentIds.length) {
    const { data: ws } = await service
      .from('worksheets')
      .select('id, uploaded_file_path')
      .in('student_id', studentIds);
    const wsIds = (ws ?? []).map((w) => w.id);
    worksheetPaths = (ws ?? []).map((w) => w.uploaded_file_path).filter((p): p is string => !!p);
    if (wsIds.length) {
      const { data: subs } = await service
        .from('worksheet_submissions')
        .select('image_url')
        .in('worksheet_id', wsIds);
      submissionPaths = (subs ?? []).map((s) => s.image_url).filter((p): p is string => !!p);
    }
  }

  // --- Null the nullable NO ACTION references to this provider so the delete isn't blocked. ---
  const nullResults = await Promise.all([
    service.from('admin_permissions').update({ granted_by: null }).eq('granted_by', providerId),
    service.from('bell_schedules').update({ created_by_id: null }).eq('created_by_id', providerId),
    service.from('care_action_items').update({ assignee_id: null }).eq('assignee_id', providerId),
    service.from('care_cases').update({ assigned_to: null }).eq('assigned_to', providerId),
    service.from('schedule_sessions').update({ completed_by: null }).eq('completed_by', providerId),
    service.from('special_activities').update({ created_by_id: null }).eq('created_by_id', providerId),
    service.from('analytics_events').update({ user_id: null }).eq('user_id', providerId),
    service.from('holidays').update({ created_by: null }).eq('created_by', providerId),
    service.from('worksheet_submissions').update({ submitted_by: null }).eq('submitted_by', providerId),
  ]);
  const nullErr = nullResults.find((r) => r.error)?.error;
  if (nullErr) {
    // Stop before the profile delete; otherwise it would fail with a confusing
    // foreign-key violation instead of this clear message.
    log.error('Failed to null provider references before delete', nullErr);
    return NextResponse.json(
      { error: `Failed to prepare account for deletion: ${nullErr.message}` },
      { status: 500 }
    );
  }

  // --- Delete the profile (cascades the provider's students + owned data) ---
  const { error: profileDelErr } = await service.from('profiles').delete().eq('id', providerId);
  if (profileDelErr) {
    log.error('Failed to delete provider profile', profileDelErr);
    return NextResponse.json(
      { error: `Failed to delete account: ${profileDelErr.message}` },
      { status: 500 }
    );
  }

  // --- Delete the Auth user ---
  const { error: authDelErr } = await service.auth.admin.deleteUser(providerId);
  if (authDelErr) {
    // Profile (and all data) is already gone; the login could not be fully removed.
    log.error('Profile deleted but auth user removal failed', authDelErr);
    return NextResponse.json({
      success: true,
      warning:
        'Account data was deleted, but the login could not be fully removed. Please retry or remove the auth user manually.',
    });
  }

  // --- Remove Storage objects (best effort; logged on failure) ---
  let storageErrors = 0;
  const removals: Array<[string, string[]]> = [
    ['saved-worksheets', savedPaths],
    ['documents', docPaths],
    ['worksheet-submissions', submissionPaths],
    ['worksheets', worksheetPaths],
  ];
  for (const [bucket, paths] of removals) {
    if (paths.length) {
      const { error } = await service.storage.from(bucket).remove(paths);
      if (error) {
        storageErrors++;
        log.error('Failed to remove Storage objects during account delete', error, { bucket });
      }
    }
  }

  log.info('Provider account deleted by admin', { providerId, deletedBy: userId, storageErrors });

  return NextResponse.json({
    success: true,
    storageObjectsRemoved:
      savedPaths.length + docPaths.length + submissionPaths.length + worksheetPaths.length,
    storageErrors: storageErrors || undefined,
  });
});
