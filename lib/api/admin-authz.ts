import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side mirror of the client `isAdminForSchool` check in
 * `lib/supabase/queries/admin-accounts.ts`. Pass the request-scoped RLS client
 * (from `createClient()`), the authenticated user id, and the target school.
 *
 * Returns true when the user is a site_admin for that exact school, or a
 * district_admin whose district owns the school. This is the authorization gate
 * for destructive admin routes that then use the service-role client to reach
 * data/Storage outside the admin's own RLS scope.
 */
export async function isAdminForSchool(
  rls: SupabaseClient,
  userId: string,
  schoolId: string
): Promise<boolean> {
  const { data: permissions } = await rls
    .from('admin_permissions')
    .select('role, school_id, district_id')
    .eq('admin_id', userId);

  if (!permissions?.length) return false;

  // Site admin for this specific school
  if (permissions.some((p) => p.role === 'site_admin' && p.school_id === schoolId)) {
    return true;
  }

  // District admin whose district owns the school
  const districtAdmin = permissions.find((p) => p.role === 'district_admin');
  if (districtAdmin?.district_id) {
    const { data: school } = await rls
      .from('schools')
      .select('district_id')
      .eq('id', schoolId)
      .single();
    if (school) return school.district_id === districtAdmin.district_id;
  }

  return false;
}
