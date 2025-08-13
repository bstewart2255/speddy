import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';

type Teacher = Database['public']['Tables']['teachers']['Row'];
type TeacherInsert = Database['public']['Tables']['teachers']['Insert'];
type TeacherUpdate = Database['public']['Tables']['teachers']['Update'];

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
        .eq('provider_id', user.id)
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

export async function createTeacher(teacherData: Omit<TeacherInsert, 'provider_id' | 'id' | 'created_at' | 'updated_at'> & { school_id?: string | null; school_site?: string | null }) {
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
          provider_id: user.id,
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

  return insertResult.data;
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
        .eq('provider_id', user.id)
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
        .eq('provider_id', user.id)
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
        .eq('id', teacherId)
        .eq('provider_id', user.id);
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
        .select('*')
        .eq('provider_id', user.id);

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

export async function getOrCreateTeacher(name: string, schoolInfo?: { school_id?: string | null; school_site?: string | null }): Promise<Teacher> {
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
    school_id: schoolInfo?.school_id || null,
    school_site: schoolInfo?.school_site || null
  });
}