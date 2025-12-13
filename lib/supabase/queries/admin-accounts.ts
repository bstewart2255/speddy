import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { requireNonNull, withDefault } from '@/lib/types/utils';
import type { Database } from '../../../src/types/database';

type AdminPermission = Database['public']['Tables']['admin_permissions']['Row'];
type AdminPermissionInsert = Database['public']['Tables']['admin_permissions']['Insert'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type Teacher = Database['public']['Tables']['teachers']['Row'];

// Types for account creation
export type CreateTeacherAccountData = {
  first_name: string;
  last_name: string;
  email: string;
  classroom_number?: string;
  phone_number?: string;
  school_id: string;
  school_site?: string;
  send_invite?: boolean; // Whether to send email invite
};

export type CreateSpecialistAccountData = {
  full_name: string;
  email: string;
  role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist';
  school_id: string;
  school_site?: string;
  district_id?: string;
  state_id?: string;
  district_domain?: string;
  send_invite?: boolean;
};

// ============================================================================
// GET CURRENT ADMIN PERMISSIONS
// ============================================================================

/**
 * Retrieves all admin permissions for the currently authenticated user.
 * Returns permissions for both site_admin and district_admin roles.
 *
 * @returns Array of AdminPermission records for the current user
 * @throws Error if user is not authenticated or database query fails
 *
 * @example
 * ```typescript
 * const permissions = await getCurrentAdminPermissions();
 * const isSiteAdmin = permissions.some(p => p.role === 'site_admin');
 * ```
 */
export async function getCurrentAdminPermissions() {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_admin_permissions' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  const fetchPerf = measurePerformanceWithAlerts('fetch_admin_permissions', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('*')
        .eq('admin_id', user.id);
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_admin_permissions',
      userId: user.id
    }
  );
  fetchPerf.end();

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data as AdminPermission[];
}

// ============================================================================
// CHECK IF USER IS ADMIN FOR A SCHOOL
// ============================================================================

/**
 * Checks if the current user has admin permissions for a specific school.
 * Verifies both site_admin (direct school access) and district_admin (school in district) roles.
 *
 * @param schoolId - UUID of the school to check access for
 * @returns true if user is admin for the school, false otherwise
 * @throws Error if user is not authenticated or database query fails
 *
 * @example
 * ```typescript
 * const hasAccess = await isAdminForSchool('school-uuid');
 * if (hasAccess) {
 *   // Allow admin operations
 * }
 * ```
 */
export async function isAdminForSchool(schoolId: string): Promise<boolean> {
  const supabase = createClient<Database>();
  const permissions = await getCurrentAdminPermissions();

  // Check if user is site admin for this specific school
  const isSiteAdmin = permissions.some(p => p.role === 'site_admin' && p.school_id === schoolId);
  if (isSiteAdmin) {
    return true;
  }

  // For district admins, verify the school belongs to their district
  const districtAdminPermission = permissions.find(p => p.role === 'district_admin');
  if (districtAdminPermission) {
    // Get the school's district_id to verify it matches
    const schoolResult = await safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('schools')
          .select('district_id')
          .eq('id', schoolId)
          .single();
        if (error) throw error;
        return data;
      },
      { operation: 'fetch_school_district', schoolId }
    );

    if (!schoolResult.error && schoolResult.data) {
      return schoolResult.data.district_id === districtAdminPermission.district_id;
    }
  }

  return false;
}

// ============================================================================
// GET ALL STAFF AT A SCHOOL
// ============================================================================

export async function getSchoolStaff(schoolId: string) {
  const supabase = createClient<Database>();

  // First verify admin has permission for this school
  const hasPermission = await isAdminForSchool(schoolId);
  if (!hasPermission) {
    throw new Error('You do not have permission to view staff at this school');
  }

  const fetchPerf = measurePerformanceWithAlerts('fetch_school_staff', 'database');

  // Fetch site admins for this school using security definer function
  const siteAdminsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .rpc('get_school_site_admins', { p_school_id: schoolId });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_school_site_admins', schoolId }
  );

  // Fetch teachers
  const teachersResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select(`
          *,
          profiles:account_id (
            id,
            email,
            full_name,
            role
          )
        `)
        .eq('school_id', schoolId)
        .order('last_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_school_teachers', schoolId }
  );

  // Fetch specialists/resource staff - primary school
  const primarySpecialistsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('school_id', schoolId)
        .in('role', ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea'])
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_school_specialists_primary', schoolId }
  );

  // Fetch specialists who work at this school as secondary (via provider_schools)
  const secondarySpecialistsResult = await safeQuery(
    async () => {
      // First get provider_ids from provider_schools for this school
      const { data: providerSchools, error: psError } = await supabase
        .from('provider_schools')
        .select('provider_id, is_primary')
        .eq('school_id', schoolId);

      if (psError) throw psError;
      if (!providerSchools || providerSchools.length === 0) return [];

      // Get unique provider IDs (excluding those where this is primary - already fetched above)
      const secondaryProviderIds = providerSchools
        .filter(ps => !ps.is_primary)
        .map(ps => ps.provider_id)
        .filter((id): id is string => id !== null);

      if (secondaryProviderIds.length === 0) return [];

      // Fetch profiles for these providers
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', secondaryProviderIds)
        .in('role', ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea'])
        .order('full_name', { ascending: true });

      if (profilesError) throw profilesError;
      return profiles;
    },
    { operation: 'fetch_school_specialists_secondary', schoolId }
  );

  if (siteAdminsResult.error) throw siteAdminsResult.error;
  if (teachersResult.error) throw teachersResult.error;
  if (primarySpecialistsResult.error) throw primarySpecialistsResult.error;
  if (secondarySpecialistsResult.error) throw secondarySpecialistsResult.error;

  // Site admins come directly from the RPC function
  const siteAdmins = (siteAdminsResult.data || []).map(sa => ({
    id: sa.admin_id,
    full_name: sa.full_name,
    email: sa.email
  }));

  // Merge and deduplicate specialists, marking primary vs secondary
  const primarySpecialists = (primarySpecialistsResult.data || []).map(s => ({
    ...s,
    isPrimarySchool: true
  }));
  const secondarySpecialists = (secondarySpecialistsResult.data || []).map(s => ({
    ...s,
    isPrimarySchool: false
  }));
  const seenIds = new Set(primarySpecialists.map(s => s.id));
  const allSpecialists = [
    ...primarySpecialists,
    ...secondarySpecialists.filter(s => !seenIds.has(s.id))
  ].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  fetchPerf.end();

  return {
    siteAdmins,
    teachers: teachersResult.data || [],
    specialists: allSpecialists
  };
}

// ============================================================================
// CHECK FOR DUPLICATE TEACHERS
// ============================================================================

export async function checkDuplicateTeachers(
  firstName: string,
  lastName: string,
  schoolId: string,
  excludeTeacherId?: string
): Promise<Teacher[]> {
  const supabase = createClient<Database>();

  const fetchResult = await safeQuery(
    async () => {
      let query = supabase
        .from('teachers')
        .select('*')
        .eq('school_id', schoolId)
        .ilike('last_name', lastName);

      if (firstName) {
        query = query.ilike('first_name', firstName);
      }

      if (excludeTeacherId) {
        query = query.neq('id', excludeTeacherId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    { operation: 'check_duplicate_teachers', schoolId, lastName }
  );

  if (fetchResult.error) throw fetchResult.error;
  return fetchResult.data || [];
}

// ============================================================================
// CREATE TEACHER ACCOUNT
// ============================================================================

export async function createTeacherAccount(data: CreateTeacherAccountData) {
  const supabase = createClient<Database>();

  // Get current user (admin)
  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_create_teacher' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const adminUser = authResult.data.data.user;

  // Verify admin has permission
  const hasPermission = await isAdminForSchool(data.school_id);
  if (!hasPermission) {
    throw new Error('You do not have permission to create accounts at this school');
  }

  // Check for duplicates
  const duplicates = await checkDuplicateTeachers(
    data.first_name,
    data.last_name,
    data.school_id
  );

  if (duplicates.length > 0) {
    throw new Error(
      `A teacher named ${data.first_name} ${data.last_name} already exists at this school. ` +
      'Please check the teacher directory or use a different name.'
    );
  }

  const createPerf = measurePerformanceWithAlerts('create_teacher_account', 'database');

  try {
    // Step 1: Create auth user (if email provided and send_invite is true)
    let profileId: string | null = null;

    if (data.email && data.send_invite) {
      // This would typically be done via an admin API endpoint that calls Supabase Admin API
      // For now, we'll just create the teacher record without auth
      // TODO: Implement admin user creation via API route
      console.warn('Email invite functionality not yet implemented');
    }

    // Step 2: Create teacher record
    const teacherResult = await safeQuery(
      async () => {
        const { data: teacher, error } = await supabase
          .from('teachers')
          .insert({
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email || null,
            classroom_number: data.classroom_number || null,
            phone_number: data.phone_number || null,
            school_id: data.school_id,
            school_site: data.school_site || null,
            account_id: profileId,
            created_by_admin: true
          })
          .select()
          .single();

        if (error) throw error;
        return teacher;
      },
      { operation: 'create_teacher_record', email: data.email }
    );

    createPerf.end();

    if (teacherResult.error) throw teacherResult.error;

    return teacherResult.data;

  } catch (error) {
    createPerf.end();
    throw error;
  }
}

// ============================================================================
// CREATE SPECIALIST ACCOUNT
// ============================================================================

export async function createSpecialistAccount(accountData: CreateSpecialistAccountData) {
  const supabase = createClient<Database>();

  // Verify admin has permission
  const hasPermission = await isAdminForSchool(accountData.school_id);
  if (!hasPermission) {
    throw new Error('You do not have permission to create accounts at this school');
  }

  const createPerf = measurePerformanceWithAlerts('create_specialist_account', 'database');

  try {
    // Check if profile with this email already exists
    // Normalize email to lowercase for consistent comparison
    const normalizedEmail = accountData.email.toLowerCase().trim();
    const existingResult = await safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', normalizedEmail)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      { operation: 'check_existing_specialist', email: normalizedEmail }
    );

    if (existingResult.data) {
      throw new Error(
        `An account with email ${accountData.email} already exists. ` +
        'Please use a different email address.'
      );
    }

    // Create auth user and profile
    // This would typically be done via an admin API endpoint
    // For now, we'll return an error
    throw new Error(
      'Specialist account creation must be done via the admin API endpoint. ' +
      'This functionality is not yet available in the client.'
    );

  } catch (error) {
    createPerf.end();
    throw error;
  }
}

// ============================================================================
// LINK EXISTING TEACHER TO PROFILE
// ============================================================================

export async function linkTeacherToProfile(
  teacherId: string,
  profileId: string
) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_link_teacher' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  // Get teacher to check school
  const teacherResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('school_id')
        .eq('id', teacherId)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'get_teacher_for_linking', teacherId }
  );

  if (teacherResult.error || !teacherResult.data) {
    throw new Error('Teacher not found');
  }

  const teacher = teacherResult.data;
  const schoolId = requireNonNull(teacher.school_id, 'teacher.school_id');

  // Verify admin has permission for this school
  const hasPermission = await isAdminForSchool(schoolId);
  if (!hasPermission) {
    throw new Error('You do not have permission to manage teachers at this school');
  }

  const updatePerf = measurePerformanceWithAlerts('link_teacher_to_profile', 'database');
  const updateResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .update({ account_id: profileId })
        .eq('id', teacherId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'link_teacher_profile', teacherId, profileId }
  );
  updatePerf.end();

  if (updateResult.error) throw updateResult.error;

  return updateResult.data;
}

// ============================================================================
// GET DUPLICATE TEACHERS (FOR CLEANUP UI)
// ============================================================================

export async function findPotentialDuplicates(schoolId: string) {
  const supabase = createClient<Database>();

  // Verify admin has permission
  const hasPermission = await isAdminForSchool(schoolId);
  if (!hasPermission) {
    throw new Error('You do not have permission to view teachers at this school');
  }

  const fetchPerf = measurePerformanceWithAlerts('find_duplicate_teachers', 'database');

  // Get all teachers at school
  const teachersResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('school_id', schoolId)
        .order('last_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_all_teachers_for_duplicates', schoolId }
  );

  fetchPerf.end();

  if (teachersResult.error) throw teachersResult.error;

  const teachers = teachersResult.data || [];

  // Group teachers by similar names
  const duplicateGroups: Teacher[][] = [];
  const processed = new Set<string>();

  for (const teacher of teachers) {
    if (processed.has(teacher.id)) continue;

    // Skip teachers without last names for duplicate detection
    if (!teacher.last_name) continue;

    const teacherLastName = teacher.last_name.toLowerCase();

    const similar = teachers.filter(t => {
      if (t.id === teacher.id || processed.has(t.id) || !t.last_name) {
        return false;
      }

      const tLastName = t.last_name.toLowerCase();

      return (
        // Exact last name match
        tLastName === teacherLastName ||
        // Very similar last names (Levenshtein distance <= 2)
        levenshteinDistance(tLastName, teacherLastName) <= 2
      );
    });

    if (similar.length > 0) {
      const group = [teacher, ...similar];
      duplicateGroups.push(group);
      group.forEach(t => processed.add(t.id));
    }
  }

  return duplicateGroups;
}

// ============================================================================
// HELPER: Levenshtein distance for fuzzy name matching
// ============================================================================

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// ============================================================================
// DISTRICT ADMIN FUNCTIONS
// ============================================================================

/**
 * Retrieves district information for the current district admin.
 * @returns District info including name and location
 */
export async function getDistrictInfo(districtId: string) {
  const supabase = createClient<Database>();

  // Verify the current user is a district admin for this district
  const permissions = await getCurrentAdminPermissions();
  const isDistrictAdmin = permissions.some(
    p => p.role === 'district_admin' && p.district_id === districtId
  );

  if (!isDistrictAdmin) {
    throw new Error('You do not have permission to view this district');
  }

  const fetchPerf = measurePerformanceWithAlerts('fetch_district_info', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('districts')
        .select('*')
        .eq('id', districtId)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_district_info', districtId }
  );
  fetchPerf.end();

  if (fetchResult.error) throw fetchResult.error;
  return fetchResult.data;
}

/**
 * Retrieves all schools in a district with staff counts.
 * @param districtId - The NCES district ID
 * @returns Array of schools with teacher and specialist counts
 */
export async function getDistrictSchools(districtId: string) {
  const supabase = createClient<Database>();

  // Verify the current user is a district admin for this district
  const permissions = await getCurrentAdminPermissions();
  const isDistrictAdmin = permissions.some(
    p => p.role === 'district_admin' && p.district_id === districtId
  );

  if (!isDistrictAdmin) {
    throw new Error('You do not have permission to view schools in this district');
  }

  const fetchPerf = measurePerformanceWithAlerts('fetch_district_schools', 'database');

  // Fetch all schools in the district
  const schoolsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name, city, zip, phone, enrollment, grade_span_low, grade_span_high')
        .eq('district_id', districtId)
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_district_schools', districtId }
  );

  if (schoolsResult.error) throw schoolsResult.error;
  const schools = schoolsResult.data || [];

  // Get staff counts for all schools in parallel
  const schoolsWithCounts = await Promise.all(
    schools.map(async (school) => {
      // Count teachers at this school
      const teacherCountResult = await safeQuery(
        async () => {
          const { count, error } = await supabase
            .from('teachers')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', school.id);
          if (error) throw error;
          return count || 0;
        },
        { operation: 'count_school_teachers', schoolId: school.id }
      );

      // Count specialists at this school (primary + secondary via provider_schools)
      const specialistCountResult = await safeQuery(
        async () => {
          // Count primary specialists
          const { count: primaryCount, error: primaryError } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', school.id)
            .in('role', ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea']);
          if (primaryError) throw primaryError;

          // Get secondary specialists from provider_schools
          const { data: providerSchools, error: psError } = await supabase
            .from('provider_schools')
            .select('provider_id, is_primary')
            .eq('school_id', school.id);
          if (psError) throw psError;

          // Count unique secondary providers (not already counted as primary)
          const secondaryProviderIds = (providerSchools || [])
            .filter(ps => !ps.is_primary && ps.provider_id)
            .map(ps => ps.provider_id);

          let secondaryCount = 0;
          if (secondaryProviderIds.length > 0) {
            const { count, error: secError } = await supabase
              .from('profiles')
              .select('*', { count: 'exact', head: true })
              .in('id', secondaryProviderIds as string[])
              .neq('school_id', school.id) // Don't double-count if primary is same school
              .in('role', ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea']);
            if (secError) throw secError;
            secondaryCount = count || 0;
          }

          return (primaryCount || 0) + secondaryCount;
        },
        { operation: 'count_school_specialists', schoolId: school.id }
      );

      return {
        ...school,
        teacherCount: teacherCountResult.error ? 0 : teacherCountResult.data,
        specialistCount: specialistCountResult.error ? 0 : specialistCountResult.data
      };
    })
  );

  fetchPerf.end();

  return schoolsWithCounts;
}

/**
 * Retrieves aggregate staff counts across all schools in a district.
 * @param districtId - The NCES district ID
 * @returns Object with total teacher and specialist counts
 */
export async function getDistrictStaffCounts(districtId: string) {
  const supabase = createClient<Database>();

  // Verify the current user is a district admin for this district
  const permissions = await getCurrentAdminPermissions();
  const isDistrictAdmin = permissions.some(
    p => p.role === 'district_admin' && p.district_id === districtId
  );

  if (!isDistrictAdmin) {
    throw new Error('You do not have permission to view staff in this district');
  }

  const fetchPerf = measurePerformanceWithAlerts('fetch_district_staff_counts', 'database');

  // First get all school IDs in the district
  const schoolsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('id')
        .eq('district_id', districtId);
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_district_school_ids', districtId }
  );

  if (schoolsResult.error) throw schoolsResult.error;
  const schoolIds = (schoolsResult.data || []).map(s => s.id);

  if (schoolIds.length === 0) {
    fetchPerf.end();
    return { teachers: 0, specialists: 0, schools: 0 };
  }

  // Count all teachers in these schools
  const teacherCountResult = await safeQuery(
    async () => {
      const { count, error } = await supabase
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .in('school_id', schoolIds);
      if (error) throw error;
      return count || 0;
    },
    { operation: 'count_district_teachers', districtId }
  );

  // Count all specialists in these schools
  const specialistCountResult = await safeQuery(
    async () => {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .in('school_id', schoolIds)
        .in('role', ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea']);
      if (error) throw error;
      return count || 0;
    },
    { operation: 'count_district_specialists', districtId }
  );

  fetchPerf.end();

  return {
    teachers: teacherCountResult.error ? 0 : teacherCountResult.data,
    specialists: specialistCountResult.error ? 0 : specialistCountResult.data,
    schools: schoolIds.length
  };
}

/**
 * Retrieves a single school's details for district admin view.
 * @param schoolId - The NCES school ID
 * @returns School info with district name
 */
export async function getSchoolDetails(schoolId: string) {
  const supabase = createClient<Database>();

  // Verify the current user has permission for this school
  const hasPermission = await isAdminForSchool(schoolId);
  if (!hasPermission) {
    throw new Error('You do not have permission to view this school');
  }

  const fetchPerf = measurePerformanceWithAlerts('fetch_school_details', 'database');

  // Fetch school with district info
  const schoolResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schools')
        .select(`
          *,
          district:districts (
            id,
            name,
            city,
            state_id
          )
        `)
        .eq('id', schoolId)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_school_details', schoolId }
  );

  if (schoolResult.error) throw schoolResult.error;
  fetchPerf.end();

  return schoolResult.data;
}

// ============================================================================
// DELETE TEACHER (FOR DUPLICATE CLEANUP)
// ============================================================================

export async function deleteTeacher(teacherId: string) {
  const supabase = createClient<Database>();

  // Get teacher to check school and ensure they can be deleted
  const teacherResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('school_id, account_id')
        .eq('id', teacherId)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'get_teacher_for_deletion', teacherId }
  );

  if (teacherResult.error || !teacherResult.data) {
    throw new Error('Teacher not found');
  }

  const teacher = teacherResult.data;
  const schoolId = requireNonNull(teacher.school_id, 'teacher.school_id');

  // Verify admin has permission
  const hasPermission = await isAdminForSchool(schoolId);
  if (!hasPermission) {
    throw new Error('You do not have permission to delete teachers at this school');
  }

  // Don't allow deleting teachers with active accounts
  if (teacher.account_id) {
    throw new Error(
      'Cannot delete teacher with an active account. ' +
      'Please unlink the account first or deactivate the account.'
    );
  }

  const deletePerf = measurePerformanceWithAlerts('delete_teacher', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('teachers')
        .delete()
        .eq('id', teacherId);
      if (error) throw error;
      return true;
    },
    { operation: 'delete_teacher', teacherId }
  );
  deletePerf.end();

  if (deleteResult.error) throw deleteResult.error;

  return true;
}
