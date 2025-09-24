import { useEffect, useState } from 'react';

interface SchoolInfo {
  school_id?: string | null;
}

export const useTeachers = (supabase: any, currentSchool: SchoolInfo | null | undefined) => {
  const [teachers, setTeachers] = useState<any[]>([]);

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
        .select('*')
        .eq('provider_id', user.user.id);

      if (checkError) {
        console.error('[SchedulePage] Error checking teachers:', checkError);
        if (isMounted) {
          setTeachers([]);
        }
        return;
      }

      let query = supabase
        .from('teachers')
        .select('*')
        .eq('provider_id', user.user.id);

      if (schoolId && allTeachers?.some(t => t.school_id)) {
        query = query.eq('school_id', schoolId);
      } else if (schoolId) {
        console.warn(
          '[SchedulePage] Current school has school_id but teachers do not have school_id values set'
        );
      }

      const { data, error } = await query.order('last_name');

      if (error) {
        console.error('[SchedulePage] Error fetching teachers:', error);
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
