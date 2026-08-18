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

      // Scope to the caller's own school whenever we know it. This used to be
      // gated on a second probe asking whether *any* teacher in the table had a
      // school_id — a global answer deciding a per-caller question, so a single
      // un-normalized environment dropped the filter and handed back every
      // school's teachers (SPE-519). A school with no teachers now returns an
      // empty list rather than everyone's.
      //
      // A caller with no active school_id still reads unfiltered, bounded only
      // by RLS to their own schools. That fallback predates SPE-519 and is left
      // as-is deliberately — narrowing it changes what those providers see, so
      // it is a product call (SPE-544), not a drive-by.
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
