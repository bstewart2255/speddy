import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { isAdminForSchool } from '@/lib/supabase/queries/admin-accounts';
import type { Database } from '@/src/types/database';

type StaffRow = Database['public']['Tables']['staff']['Row'];
type StaffHoursRow = Database['public']['Tables']['staff_hours']['Row'];

export type StaffRole = 'instructional_assistant' | 'supervisor' | 'office';

export type TeacherOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type StaffWithHours = StaffRow & {
  staff_hours: StaffHoursRow[];
  teachers: TeacherOption | null;
};

export type CreateStaffData = {
  first_name: string;
  last_name: string;
  role: StaffRole;
  school_id: string;
  program?: string;
  teacher_id?: string;
  room_number?: string;
  status?: string;
  hours?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
};

export type UpdateStaffData = {
  first_name?: string;
  last_name?: string;
  role?: StaffRole;
  program?: string | null;
  teacher_id?: string | null;
  room_number?: string | null;
  status?: string | null;
  hours?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
};

// ============================================================================
// GET SCHOOL STAFF MEMBERS
// ============================================================================

export async function getSchoolStaffMembers(schoolId: string): Promise<StaffWithHours[]> {
  const supabase = createClient<Database>();

  const hasAccess = await isAdminForSchool(schoolId);
  if (!hasAccess) {
    throw new Error('You do not have permission to view staff at this school');
  }

  const fetchPerf = measurePerformanceWithAlerts('fetch_school_staff_members', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('*, staff_hours(*), teachers(id, first_name, last_name)')
        .eq('school_id', schoolId)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_school_staff_members', schoolId }
  );
  fetchPerf.end({
    success: !fetchResult.error,
    metadata: { recordCount: fetchResult.data?.length || 0 }
  });

  if (fetchResult.error) throw fetchResult.error;
  return (fetchResult.data || []) as StaffWithHours[];
}

// ============================================================================
// GET SCHOOL TEACHER OPTIONS (for dropdown)
// ============================================================================

export async function getSchoolTeacherOptions(schoolId: string): Promise<TeacherOption[]> {
  const supabase = createClient<Database>();

  const hasAccess = await isAdminForSchool(schoolId);
  if (!hasAccess) {
    throw new Error('You do not have permission to view teachers at this school');
  }

  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')
        .eq('school_id', schoolId)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_school_teacher_options', schoolId }
  );

  if (fetchResult.error) throw fetchResult.error;
  return (fetchResult.data || []) as TeacherOption[];
}

// ============================================================================
// CREATE STAFF MEMBER
// ============================================================================

export async function createStaffMember(data: CreateStaffData): Promise<StaffRow> {
  const supabase = createClient<Database>();

  const hasAccess = await isAdminForSchool(data.school_id);
  if (!hasAccess) {
    throw new Error('You do not have permission to add staff at this school');
  }

  const { hours, ...staffData } = data;

  const createPerf = measurePerformanceWithAlerts('create_staff_member', 'database');
  const createResult = await safeQuery(
    async () => {
      const { data: newStaff, error } = await supabase
        .from('staff')
        .insert(staffData)
        .select()
        .single();
      if (error) throw error;
      return newStaff;
    },
    { operation: 'create_staff_member', schoolId: data.school_id }
  );
  createPerf.end({ success: !createResult.error });

  if (createResult.error) throw createResult.error;
  const staff = createResult.data as StaffRow;

  // Insert hours if provided
  if (hours && hours.length > 0) {
    const hoursRows = hours.map(h => ({
      staff_id: staff.id,
      day_of_week: h.day_of_week,
      start_time: h.start_time,
      end_time: h.end_time,
    }));

    const hoursResult = await safeQuery(
      async () => {
        const { error } = await supabase.from('staff_hours').insert(hoursRows);
        if (error) throw error;
      },
      { operation: 'create_staff_hours', staffId: staff.id }
    );

    if (hoursResult.error) throw hoursResult.error;
  }

  return staff;
}

// ============================================================================
// UPDATE STAFF MEMBER
// ============================================================================

export async function updateStaffMember(staffId: string, updates: UpdateStaffData): Promise<StaffRow> {
  const supabase = createClient<Database>();

  // Fetch staff to get school_id for permission check
  const staffResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('school_id')
        .eq('id', staffId)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_staff_for_update', staffId }
  );

  if (staffResult.error) throw staffResult.error;
  if (!staffResult.data) throw new Error('Staff member not found');

  const hasAccess = await isAdminForSchool(staffResult.data.school_id);
  if (!hasAccess) {
    throw new Error('You do not have permission to update staff at this school');
  }

  const { hours, ...staffUpdates } = updates;

  // Update staff record
  const updatePerf = measurePerformanceWithAlerts('update_staff_member', 'database');
  const updateResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('staff')
        .update(staffUpdates)
        .eq('id', staffId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'update_staff_member', staffId }
  );
  updatePerf.end({ success: !updateResult.error });

  if (updateResult.error) throw updateResult.error;

  // Replace hours if provided
  if (hours !== undefined) {
    // Delete existing hours
    await safeQuery(
      async () => {
        const { error } = await supabase
          .from('staff_hours')
          .delete()
          .eq('staff_id', staffId);
        if (error) throw error;
      },
      { operation: 'delete_staff_hours', staffId }
    );

    // Insert new hours
    if (hours.length > 0) {
      const hoursRows = hours.map(h => ({
        staff_id: staffId,
        day_of_week: h.day_of_week,
        start_time: h.start_time,
        end_time: h.end_time,
      }));

      const hoursResult = await safeQuery(
        async () => {
          const { error } = await supabase.from('staff_hours').insert(hoursRows);
          if (error) throw error;
        },
        { operation: 'insert_staff_hours', staffId }
      );

      if (hoursResult.error) throw hoursResult.error;
    }
  }

  return updateResult.data as StaffRow;
}

// ============================================================================
// DELETE STAFF MEMBER
// ============================================================================

export async function deleteStaffMember(staffId: string): Promise<void> {
  const supabase = createClient<Database>();

  // Fetch staff to get school_id for permission check
  const staffResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('school_id')
        .eq('id', staffId)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_staff_for_delete', staffId }
  );

  if (staffResult.error) throw staffResult.error;
  if (!staffResult.data) throw new Error('Staff member not found');

  const hasAccess = await isAdminForSchool(staffResult.data.school_id);
  if (!hasAccess) {
    throw new Error('You do not have permission to delete staff at this school');
  }

  const deletePerf = measurePerformanceWithAlerts('delete_staff_member', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffId);
      if (error) throw error;
    },
    { operation: 'delete_staff_member', staffId }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) throw deleteResult.error;
}
