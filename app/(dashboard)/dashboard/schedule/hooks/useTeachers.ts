import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Teacher } from '../types/teacher';

interface SchoolInfo {
  school_id?: string | null;
}

export const useTeachers = (supabase: SupabaseClient, currentSchool: SchoolInfo | null | undefined) => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  useEffect(() => {
    let isMounted = true;
    const schoolId = currentSchool?.school_id ?? null;

    async function fetchTeachers() {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        if (isMounted) {
          setTeachers([]);
        }
        return;
      }

      const { data: allTeachers, error: checkError } = await supabase
        .from('teachers')
        .select('school_id');

      if (checkError) {
        if (isMounted) {
          setTeachers([]);
        }
        return;
      }

      let query = supabase
        .from('teachers')
        .select('*');

      if (schoolId && allTeachers?.some(t => t.school_id)) {
        query = query.eq('school_id', schoolId);
      }

      const { data, error } = await query.order('last_name');

      if (error) {
        if (isMounted) {
          setTeachers([]);
        }
        return;
      }

      if (isMounted) {
        setTeachers(data ?? []);
      }
    }

    fetchTeachers();

    return () => {
      isMounted = false;
    };
  }, [supabase, currentSchool?.school_id]);

  return teachers;
};
