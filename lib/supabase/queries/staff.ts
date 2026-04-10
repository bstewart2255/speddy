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
  type: 'teacher' | 'provider';
};

export type ProviderOption = {
  id: string;
  full_name: string;
};

export type StaffAssignment = {
  id: string;
  teacher_id: string | null;
  provider_id: string | null;
  teachers: { id: string; first_name: string | null; last_name: string | null } | null;
  profiles: { id: string; full_name: string } | null;
};

export type StaffWithHours = StaffRow & {
  staff_hours: StaffHoursRow[];
  staff_teacher_assignments: StaffAssignment[];
};

export type CreateStaffData = {
  first_name: string;
  last_name: string;
  role: StaffRole;
  school_id: string;
  program?: string;
  room_number?: string;
  status?: string;
  hours?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
  assignments?: Array<{ teacher_id?: string; provider_id?: string }>;
};

export type UpdateStaffData = {
  first_name?: string;
  last_name?: string;
  role?: StaffRole;
  program?: string | null;
  room_number?: string | null;
  status?: string | null;
  hours?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
  assignments?: Array<{ teacher_id?: string; provider_id?: string }>;
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
        .select('*, staff_hours(*), staff_teacher_assignments(id, teacher_id, provider_id, teachers(id, first_name, last_name), profiles:provider_id(id, full_name))')
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

  // Fetch teachers and providers in parallel
  const [teacherResult, providerResult] = await Promise.all([
    safeQuery(
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
    ),
    safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('provider_schools')
          .select('profiles:provider_id(id, full_name)')
          .eq('school_id', schoolId);
        if (error) throw error;
        return data;
      },
      { operation: 'fetch_school_provider_options', schoolId }
    ),
  ]);

  if (teacherResult.error) throw teacherResult.error;
  if (providerResult.error) throw providerResult.error;

  const teachers: TeacherOption[] = (teacherResult.data || []).map(t => ({
    id: t.id,
    first_name: t.first_name,
    last_name: t.last_name,
    type: 'teacher' as const,
  }));

  const providers: TeacherOption[] = (providerResult.data || [])
    .filter((row: any) => row.profiles)
    .map((row: any) => {
      const p = row.profiles;
      // Split full_name into first/last for consistent display
      const parts = (p.full_name || '').trim().split(/\s+/);
      const firstName = parts[0] || null;
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
      return {
        id: p.id,
        first_name: firstName,
        last_name: lastName,
        type: 'provider' as const,
      };
    });

  return [...teachers, ...providers];
}

// ============================================================================
// GET SCHOOL PROVIDERS (for yard duty assignment dropdown)
// ============================================================================

export async function getSchoolProviders(schoolId: string): Promise<ProviderOption[]> {
  const supabase = createClient<Database>();

  const hasAccess = await isAdminForSchool(schoolId);
  if (!hasAccess) {
    throw new Error('You do not have permission to view providers at this school');
  }

  const { data, error } = await supabase
    .from('provider_schools')
    .select('profiles:provider_id(id, full_name)')
    .eq('school_id', schoolId);

  if (error) throw error;

  return (data || [])
    .filter((row: any) => row.profiles)
    .map((row: any) => ({
      id: row.profiles.id,
      full_name: row.profiles.full_name || 'Unknown Provider',
    }));
}

// ============================================================================
// CREATE STAFF MEMBER
// TODO: Wrap staff + hours mutations in a single Postgres RPC function
// for atomicity. Currently split across multiple HTTP requests — if hours
// insert fails, a partial staff record is left behind. (#582 review item)
// ============================================================================

export async function createStaffMember(data: CreateStaffData): Promise<StaffRow> {
  const supabase = createClient<Database>();

  const hasAccess = await isAdminForSchool(data.school_id);
  if (!hasAccess) {
    throw new Error('You do not have permission to add staff at this school');
  }

  const { hours, assignments, ...staffData } = data;

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

  // Insert teacher/provider assignments if provided
  if (assignments && assignments.length > 0) {
    const assignmentRows = assignments.map(a => ({
      staff_id: staff.id,
      teacher_id: a.teacher_id || null,
      provider_id: a.provider_id || null,
    }));

    const assignResult = await safeQuery(
      async () => {
        const { error } = await supabase.from('staff_teacher_assignments').insert(assignmentRows);
        if (error) throw error;
      },
      { operation: 'create_staff_assignments', staffId: staff.id }
    );

    if (assignResult.error) throw assignResult.error;
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

  const { hours, assignments, ...staffUpdates } = updates;

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
    const deleteHoursResult = await safeQuery(
      async () => {
        const { error } = await supabase
          .from('staff_hours')
          .delete()
          .eq('staff_id', staffId);
        if (error) throw error;
      },
      { operation: 'delete_staff_hours', staffId }
    );
    if (deleteHoursResult.error) throw deleteHoursResult.error;

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

  // Replace assignments if provided
  if (assignments !== undefined) {
    // Delete existing assignments
    const deleteAssignResult = await safeQuery(
      async () => {
        const { error } = await supabase
          .from('staff_teacher_assignments')
          .delete()
          .eq('staff_id', staffId);
        if (error) throw error;
      },
      { operation: 'delete_staff_assignments', staffId }
    );
    if (deleteAssignResult.error) throw deleteAssignResult.error;

    // Insert new assignments
    if (assignments.length > 0) {
      const assignmentRows = assignments.map(a => ({
        staff_id: staffId,
        teacher_id: a.teacher_id || null,
        provider_id: a.provider_id || null,
      }));

      const assignResult = await safeQuery(
        async () => {
          const { error } = await supabase.from('staff_teacher_assignments').insert(assignmentRows);
          if (error) throw error;
        },
        { operation: 'insert_staff_assignments', staffId }
      );

      if (assignResult.error) throw assignResult.error;
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
