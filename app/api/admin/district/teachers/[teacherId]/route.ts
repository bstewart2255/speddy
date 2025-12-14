import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

const log = logger.child({ module: 'district-admin-teacher' });

interface RouteParams {
  params: { teacherId: string };
}

/**
 * Helper to verify district admin has access to the teacher
 */
async function verifyDistrictAdminAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  teacherId: string
): Promise<{ allowed: boolean; districtId?: string; teacher?: any; error?: string }> {
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

  // Use admin client to verify the teacher is in the district admin's district
  const adminClient = createServiceClient();

  // Get teacher with school info
  const { data: teacher, error: teacherError } = await adminClient
    .from('teachers')
    .select('*, schools (district_id)')
    .eq('id', teacherId)
    .single();

  if (teacherError || !teacher) {
    return { allowed: false, error: 'Teacher not found' };
  }

  const schoolDistrict = (teacher.schools as any)?.district_id;
  if (schoolDistrict !== adminPermission.district_id) {
    return { allowed: false, error: 'Teacher is not in your district' };
  }

  return { allowed: true, districtId: adminPermission.district_id, teacher };
}

/**
 * GET /api/admin/district/teachers/[teacherId]
 * Get teacher details including deletability check
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { teacherId } = params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, teacherId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Use admin client for queries
    const adminClient = createServiceClient();

    // Get teacher details
    const { data: teacher } = await adminClient
      .from('teachers')
      .select('*, schools (id, name)')
      .eq('id', teacherId)
      .single();

    // Check for dependencies (students assigned to this teacher)
    const { count: studentCount } = await adminClient
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacherId);

    const canDelete = (studentCount || 0) === 0 && !teacher?.account_id;

    let blockerReason: string | undefined;
    if (!canDelete) {
      const reasons: string[] = [];
      if ((studentCount || 0) > 0) reasons.push(`${studentCount} student(s) assigned`);
      if (teacher?.account_id) reasons.push('has an active user account');
      blockerReason = `Cannot delete teacher: ${reasons.join(', ')}.`;
    }

    return NextResponse.json({
      teacher: {
        id: teacher?.id,
        first_name: teacher?.first_name,
        last_name: teacher?.last_name,
        email: teacher?.email,
        classroom_number: teacher?.classroom_number,
        phone_number: teacher?.phone_number,
        school_id: teacher?.school_id,
        school_name: (teacher?.schools as any)?.name,
        has_account: !!teacher?.account_id,
      },
      canDelete,
      blockerReason,
      dependencyCounts: [
        { label: 'Students', count: studentCount || 0 },
        { label: 'Has Account', count: teacher?.account_id ? 1 : 0 },
      ],
    });
  } catch (error) {
    log.error('Unexpected error fetching teacher', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/district/teachers/[teacherId]
 * Update teacher information
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { teacherId } = params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, teacherId);
    if (!accessCheck.allowed) {
      log.warn('District admin access denied for teacher update', {
        userId: user.id,
        teacherId,
        reason: accessCheck.error,
      });
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    const body = await request.json();
    const { first_name, last_name, email, classroom_number, phone_number } = body as {
      first_name?: string;
      last_name?: string;
      email?: string;
      classroom_number?: string;
      phone_number?: string;
    };

    // Build update object
    const updates: Record<string, unknown> = {};
    if (first_name !== undefined) updates.first_name = first_name.trim();
    if (last_name !== undefined) updates.last_name = last_name.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (classroom_number !== undefined) updates.classroom_number = classroom_number.trim() || null;
    if (phone_number !== undefined) updates.phone_number = phone_number.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Use admin client for update
    const adminClient = createServiceClient();

    // Check for email uniqueness if email is being changed
    if (updates.email && updates.email !== accessCheck.teacher?.email) {
      const { data: existingTeacher } = await adminClient
        .from('teachers')
        .select('id')
        .eq('school_id', accessCheck.teacher.school_id)
        .eq('email', updates.email as string)
        .neq('id', teacherId)
        .maybeSingle();

      if (existingTeacher) {
        return NextResponse.json(
          { error: 'A teacher with this email already exists at this school' },
          { status: 409 }
        );
      }
    }

    log.info('District admin updating teacher', {
      teacherId,
      updates: Object.keys(updates),
      updatedBy: user.id,
    });

    const { data: updatedTeacher, error: updateError } = await adminClient
      .from('teachers')
      .update(updates)
      .eq('id', teacherId)
      .select()
      .single();

    if (updateError) {
      log.error('Failed to update teacher', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update teacher' },
        { status: 500 }
      );
    }

    // If teacher has an account and name was changed, update profile too
    if ((first_name !== undefined || last_name !== undefined) && accessCheck.teacher?.account_id) {
      const newFullName = `${first_name ?? accessCheck.teacher.first_name} ${last_name ?? accessCheck.teacher.last_name}`;
      await adminClient
        .from('profiles')
        .update({ full_name: newFullName })
        .eq('id', accessCheck.teacher.account_id);
    }

    log.info('Teacher updated successfully', {
      teacherId,
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      teacher: updatedTeacher,
    });
  } catch (error) {
    log.error('Unexpected error in teacher update', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/district/teachers/[teacherId]
 * Delete a teacher (only if no dependencies)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { teacherId } = params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, teacherId);
    if (!accessCheck.allowed) {
      log.warn('District admin access denied for teacher delete', {
        userId: user.id,
        teacherId,
        reason: accessCheck.error,
      });
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Use admin client for checks and delete
    const adminClient = createServiceClient();

    // Check for dependencies
    const { count: studentCount } = await adminClient
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacherId);

    if ((studentCount || 0) > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete teacher with assigned students',
          canDelete: false,
          blockerReason: `This teacher has ${studentCount} student(s) assigned. Reassign them first.`,
          dependencyCounts: [
            { label: 'Students', count: studentCount || 0 },
          ],
        },
        { status: 409 }
      );
    }

    // Check if teacher has an account
    if (accessCheck.teacher?.account_id) {
      return NextResponse.json(
        {
          error: 'Cannot delete teacher with active user account',
          canDelete: false,
          blockerReason: 'This teacher has a user account. Remove their account first.',
          dependencyCounts: [
            { label: 'Students', count: 0 },
            { label: 'Has Account', count: 1 },
          ],
        },
        { status: 409 }
      );
    }

    log.info('District admin deleting teacher', {
      teacherId,
      deletedBy: user.id,
    });

    // Delete the teacher record
    const { error: deleteError } = await adminClient
      .from('teachers')
      .delete()
      .eq('id', teacherId);

    if (deleteError) {
      log.error('Failed to delete teacher', deleteError);
      return NextResponse.json(
        { error: deleteError.message || 'Failed to delete teacher' },
        { status: 500 }
      );
    }

    log.info('Teacher deleted successfully', {
      teacherId,
      deletedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Teacher deleted successfully',
    });
  } catch (error) {
    log.error('Unexpected error in teacher delete', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
