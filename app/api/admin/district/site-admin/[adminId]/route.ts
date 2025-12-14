import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'district-admin-site-admin' });

interface RouteParams {
  params: { adminId: string };
}

/**
 * Helper to verify district admin has access to manage site admin
 */
async function verifyDistrictAdminAccess(
  supabase: ReturnType<typeof createRouteHandlerClient<Database>>,
  userId: string,
  adminId: string
): Promise<{ allowed: boolean; districtId?: string; error?: string }> {
  // Get admin's district
  const { data: adminPermission, error: permError } = await supabase
    .from('admin_permissions')
    .select('district_id')
    .eq('admin_id', userId)
    .eq('role', 'district_admin')
    .single();

  if (permError || !adminPermission?.district_id) {
    return { allowed: false, error: 'District admin access required' };
  }

  // Use admin client to verify the site admin is in the district admin's district
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: siteAdminPermission, error: siteAdminError } = await adminClient
    .from('admin_permissions')
    .select('district_id, school_id')
    .eq('admin_id', adminId)
    .eq('role', 'site_admin')
    .single();

  if (siteAdminError || !siteAdminPermission) {
    return { allowed: false, error: 'Site admin not found' };
  }

  if (siteAdminPermission.district_id !== adminPermission.district_id) {
    return { allowed: false, error: 'Site admin is not in your district' };
  }

  return { allowed: true, districtId: adminPermission.district_id };
}

/**
 * DELETE /api/admin/district/site-admin/[adminId]
 * Remove site admin permission (keeps the account)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { adminId } = params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, adminId);
    if (!accessCheck.allowed) {
      log.warn('District admin access denied for site admin removal', {
        userId: user.id,
        adminId,
        reason: accessCheck.error,
      });
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Use admin client for delete
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get the site admin info before deletion for logging
    const { data: siteAdminInfo } = await adminClient
      .from('admin_permissions')
      .select('school_id')
      .eq('admin_id', adminId)
      .eq('role', 'site_admin')
      .single();

    log.info('District admin removing site admin permission', {
      siteAdminId: adminId,
      schoolId: siteAdminInfo?.school_id,
      removedBy: user.id,
    });

    // Delete the admin_permissions record (NOT the auth user)
    const { error: deleteError } = await adminClient
      .from('admin_permissions')
      .delete()
      .eq('admin_id', adminId)
      .eq('role', 'site_admin');

    if (deleteError) {
      log.error('Failed to remove site admin permission', deleteError);
      return NextResponse.json(
        { error: deleteError.message || 'Failed to remove site admin permission' },
        { status: 500 }
      );
    }

    log.info('Site admin permission removed successfully', {
      siteAdminId: adminId,
      removedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Site admin permission removed successfully',
    });
  } catch (error) {
    log.error('Unexpected error in site admin removal', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/admin/district/site-admin/[adminId]
 * Get site admin details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { adminId } = params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, adminId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Use admin client to fetch site admin details
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get permission info with school
    const { data: permission, error: permError } = await adminClient
      .from('admin_permissions')
      .select(`
        admin_id,
        school_id,
        schools (
          id,
          name
        )
      `)
      .eq('admin_id', adminId)
      .eq('role', 'site_admin')
      .single();

    if (permError || !permission) {
      return NextResponse.json({ error: 'Site admin not found' }, { status: 404 });
    }

    // Get profile info
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', adminId)
      .single();

    return NextResponse.json({
      siteAdmin: {
        id: adminId,
        full_name: profile?.full_name || 'Unknown',
        email: profile?.email || 'Unknown',
        school_id: permission.school_id,
        school_name: (permission.schools as any)?.name || 'Unknown School',
      },
    });
  } catch (error) {
    log.error('Unexpected error fetching site admin', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
