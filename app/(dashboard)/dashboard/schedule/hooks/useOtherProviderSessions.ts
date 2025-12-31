import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Session from another provider for the same student (matched by initials, grade, school, teacher)
 */
export interface OtherProviderSession {
  day_of_week: number;
  start_time: string;
  end_time: string;
  provider_role: string;
}

/**
 * Hook to fetch schedule sessions from other providers for a matching student.
 * Uses fuzzy matching (initials + grade + school + teacher) to find related students.
 *
 * @param studentId - UUID of the student to find other provider sessions for, or null
 * @returns { sessions, loading } - Array of other provider sessions and loading state
 */
export function useOtherProviderSessions(studentId: string | null) {
  const [sessions, setSessions] = useState<OtherProviderSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studentId) {
      setSessions([]);
      return;
    }

    let cancelled = false;

    const fetchSessions = async () => {
      setLoading(true);

      try {
        const supabase = createClient();

        // Call the find_matching_provider_sessions RPC function
        // Note: Using type assertion since the RPC function may not be in generated types yet
        const { data, error } = await (supabase.rpc as any)('find_matching_provider_sessions', {
          p_student_id: studentId
        });

        if (error) {
          console.error('Error fetching other provider sessions:', error);
          if (!cancelled) {
            setSessions([]);
          }
          return;
        }

        if (!cancelled) {
          setSessions(data || []);
        }
      } catch (error) {
        console.error('Error fetching other provider sessions:', error);
        if (!cancelled) {
          setSessions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchSessions();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return { sessions, loading };
}
