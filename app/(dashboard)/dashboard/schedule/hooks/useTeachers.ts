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

      let query = supabase
        .from('teachers')
        .select('*');

      // Scope to the caller's own school, full stop. This used to be gated on a
      // separate probe asking whether *any* teacher in the table had a
      // school_id — a global answer deciding a per-caller question, so a single
      // un-normalized environment would drop the filter and hand back every
      // school's teachers (SPE-519). A school with no teachers should return an
      // empty list, not everyone's.
      if (schoolId) {
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
