import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { requireNonNull } from '@/lib/types/utils';
import type { Database } from '../../../src/types/database';

type Teacher = Database['public']['Tables']['teachers']['Row'];
type TeacherInsert = Database['public']['Tables']['teachers']['Insert'];
type TeacherUpdate = Database['public']['Tables']['teachers']['Update'];

// Separate type for teacher creation data for clarity
export type TeacherCreationData = {
  first_name: string | null;
  last_name: string;
  email?: string | null;
  classroom_number?: string | null;
  phone_number?: string | null;
  school_id?: string | null;
  school_site?: string | null;
};

export async function getTeachers() {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_teachers' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  const fetchPerf = measurePerformanceWithAlerts('fetch_teachers', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_teachers',
      userId: user.id
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw fetchResult.error;
  }
  
  return fetchResult.data || [];
}

export async function createTeacher(teacherData: TeacherCreationData) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_create_teacher' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('You must be logged in to add teachers');
  }

  const user = authResult.data.data.user;

  const insertPerf = measurePerformanceWithAlerts('create_teacher', 'database');
  const insertResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .insert([{
          ...teacherData,
          school_id: teacherData.school_id || null,
          school_site: teacherData.school_site || null
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'create_teacher',
      userId: user.id,
      teacherName: `${teacherData.first_name} ${teacherData.last_name}`
    }
  );
  insertPerf.end({ success: !insertResult.error });

  if (insertResult.error) {
    throw new Error(insertResult.error.message || 'Failed to add teacher');
  }

  return requireNonNull(insertResult.data, 'created teacher data');
}

export async function updateTeacher(teacherId: string, updates: TeacherUpdate) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_update_teacher' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  const updatePerf = measurePerformanceWithAlerts('update_teacher', 'database');
  const updateResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .update(updates)
        .eq('id', teacherId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'update_teacher',
      userId: user.id,
      teacherId
    }
  );
  updatePerf.end({ success: !updateResult.error });

  if (updateResult.error) {
    if (updateResult.error.message?.includes('PGRST116')) {
      throw new Error('Teacher not found or access denied');
    }
    throw updateResult.error;
  }

  return updateResult.data;
}

export async function deleteTeacher(teacherId: string) {
  const supabase = createClient<Database>();
  
  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_teacher' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  const verifyPerf = measurePerformanceWithAlerts('verify_teacher_ownership', 'database');
  const verifyResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('id')
        .eq('id', teacherId)
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'verify_teacher_ownership',
      userId: user.id,
      teacherId
    }
  );
  verifyPerf.end({ success: !verifyResult.error });

  if (verifyResult.error || !verifyResult.data) {
    throw new Error('Teacher not found or access denied');
  }

  const deletePerf = measurePerformanceWithAlerts('delete_teacher', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('teachers')
        .delete()
        .eq('id', teacherId);
      if (error) throw error;
      return null;
    },
    {
      operation: 'delete_teacher',
      userId: user.id,
      teacherId
    }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) throw deleteResult.error;
}

export async function getTeacherByName(name: string): Promise<Teacher | null> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_teacher_by_name' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  const nameParts = name.trim().split(' ');
  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts.slice(0, -1).join(' ');

  const fetchPerf = measurePerformanceWithAlerts('fetch_teacher_by_name', 'database');
  const fetchResult = await safeQuery(
    async () => {
      let query = supabase
        .from('teachers')
        .select('*');

      if (firstName && lastName) {
        query = query
          .eq('first_name', firstName)
          .eq('last_name', lastName);
      } else {
        query = query.or(`last_name.eq.${name},first_name.eq.${name}`);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_teacher_by_name',
      userId: user.id,
      teacherName: name
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching teacher by name:', fetchResult.error);
    return null;
  }
  
  return fetchResult.data;
}

/**
 * @deprecated This function is deprecated and should not be used for new code.
 *
 * **Why deprecated:**
 * - Teachers should only be created by site administrators, not auto-created by specialists
 * - Auto-creation leads to duplicate/inconsistent teacher records
 * - New student forms use TeacherAutocomplete which requires existing teachers
 *
 * **What to do instead:**
 * - Use TeacherAutocomplete component to select from existing teachers
 * - Site admins should create teachers via the Teachers page before students are added
 * - For bulk imports, match teacher names to existing teachers or prompt for manual assignment
 *
 * **Migration path:**
 * - Run the migration script: 20251113_migrate_students_teacher_name_to_teacher_id.sql
 * - This will populate teacher_id for existing students based on teacher_name
 * - Remaining unmatched records should be manually assigned by site admins
 *
 * @param name - Teacher name (usually last name or "FirstName LastName")
 * @param schoolInfo - Optional school identification for scoping
 * @returns Promise<Teacher> - Existing or newly created teacher record
 */
export async function getOrCreateTeacher(
  name: string,
  schoolInfo: { school_id?: string | null; school_site?: string | null } = {}
): Promise<Teacher> {
  console.warn(
    '[DEPRECATED] getOrCreateTeacher() is deprecated. ' +
    'Teachers should be created by site administrators only. ' +
    'Use TeacherAutocomplete component to select existing teachers instead.'
  );

  const existing = await getTeacherByName(name);
  if (existing) return existing;

  const nameParts = name.trim().split(' ');
  const lastName = nameParts[nameParts.length - 1] || '';
  const firstName = nameParts.slice(0, -1).join(' ') || '';

  return await createTeacher({
    first_name: firstName || null,
    last_name: lastName || name,
    email: null,
    classroom_number: null,
    phone_number: null,
    school_id: schoolInfo.school_id || null,
    school_site: schoolInfo.school_site || null
  });
}