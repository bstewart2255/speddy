import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';

// Types for the Today's Sessions widget
export interface SessionWithDetails {
  id: string;
  start_time: string;
  end_time: string;
  service_type: string | null;
  provider: {
    id: string;
    full_name: string;
    role: string;
  };
  student: {
    id: string;
    initials: string;
    grade_level: string;
  };
  isAssigned: boolean; // True if assigned to a different specialist (not SEA)
}

export interface TodaySessionsResult {
  sessions: SessionWithDetails[];
  isWeekend: boolean;
  holiday: { name: string } | null;
}

/**
 * Get all sessions happening today at a specific school.
 * Returns sessions in chronological order with provider and student details.
 * Also checks for weekend and holidays.
 *
 * @param schoolId - The school ID to fetch sessions for
 * @returns Object containing sessions array, weekend flag, and holiday info
 */
export async function getTodaySchoolSessions(schoolId: string): Promise<TodaySessionsResult> {
  const today = new Date();
  const jsDay = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Convert JS day (0-6, Sun-Sat) to database day_of_week (1-5, Mon-Fri)
  // Database constraint: day_of_week BETWEEN 1 AND 5 (Mon=1, Tue=2, ..., Fri=5)
  // Sunday (0) and Saturday (6) are weekends and not stored in database
  const isWeekend = jsDay === 0 || jsDay === 6;
  if (isWeekend) {
    return {
      sessions: [],
      isWeekend: true,
      holiday: null
    };
  }
  // jsDay 1-5 maps directly to database day_of_week 1-5 (Mon-Fri)
  const dayOfWeek = jsDay;

  const supabase = createClient<Database>();

  // Get today's date string in YYYY-MM-DD format using UTC to avoid timezone issues
  const dateStr = today.toISOString().split('T')[0];

  // Check for holidays at this school
  const holidayPerf = measurePerformanceWithAlerts('fetch_today_school_holiday', 'database');
  const holidayResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, name')
        .eq('date', dateStr)
        .eq('school_id', schoolId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_today_school_holiday', schoolId, date: dateStr }
  );
  holidayPerf.end({ success: !holidayResult.error });

  // If there's a holiday, return early with holiday info
  if (holidayResult.data) {
    return {
      sessions: [],
      isWeekend: false,
      holiday: { name: holidayResult.data.name || 'Holiday' }
    };
  }

  // Get all student IDs at this school
  const studentsPerf = measurePerformanceWithAlerts('fetch_school_student_ids', 'database');
  const studentsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id')
        .eq('school_id', schoolId);
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_school_student_ids', schoolId }
  );
  studentsPerf.end({ success: !studentsResult.error });

  if (studentsResult.error || !studentsResult.data || studentsResult.data.length === 0) {
    return {
      sessions: [],
      isWeekend: false,
      holiday: null
    };
  }

  const studentIds = studentsResult.data.map(s => s.id);

  // Fetch today's sessions (template sessions where day_of_week matches)
  const sessionsPerf = measurePerformanceWithAlerts('fetch_today_school_sessions', 'database');
  const sessionsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select(`
          id,
          start_time,
          end_time,
          service_type,
          student_id,
          provider_id,
          assigned_to_specialist_id,
          assigned_to_sea_id
        `)
        .in('student_id', studentIds)
        .eq('day_of_week', dayOfWeek)
        .is('session_date', null)
        .not('start_time', 'is', null)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_today_school_sessions', schoolId, dayOfWeek }
  );
  sessionsPerf.end({ success: !sessionsResult.error });

  if (sessionsResult.error || !sessionsResult.data || sessionsResult.data.length === 0) {
    return {
      sessions: [],
      isWeekend: false,
      holiday: null
    };
  }

  const sessions = sessionsResult.data;

  // Get unique provider IDs (both original and assigned specialists) and student IDs for lookups
  // Note: We don't include assigned_to_sea_id because SEAs should not appear on the dashboard
  const providerIds = [...new Set([
    ...sessions.map(s => s.provider_id).filter((id): id is string => id !== null),
    ...sessions.map(s => s.assigned_to_specialist_id).filter((id): id is string => id !== null)
  ])];
  const sessionStudentIds = [...new Set(sessions.map(s => s.student_id).filter((id): id is string => id !== null))];

  // Fetch provider details (includes both original providers and assigned specialists)
  const providersPerf = measurePerformanceWithAlerts('fetch_session_providers', 'database');
  const providersResult = await safeQuery(
    async () => {
      if (providerIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', providerIds);
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_session_providers', providerIds }
  );
  providersPerf.end({ success: !providersResult.error });

  // Fetch student details
  const studentsDetailPerf = measurePerformanceWithAlerts('fetch_session_students', 'database');
  const studentsDetailResult = await safeQuery(
    async () => {
      if (sessionStudentIds.length === 0) return [];
      const { data, error } = await supabase
        .from('students')
        .select('id, initials, grade_level')
        .in('id', sessionStudentIds);
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_session_students', sessionStudentIds }
  );
  studentsDetailPerf.end({ success: !studentsDetailResult.error });

  // Build lookup maps
  const providerMap = new Map(
    (providersResult.data || []).map(p => [p.id, {
      id: p.id,
      full_name: p.full_name || 'Unknown',
      role: p.role || 'specialist'
    }])
  );
  const studentMap = new Map(
    (studentsDetailResult.data || []).map(s => [s.id, {
      id: s.id,
      initials: s.initials,
      grade_level: s.grade_level
    }])
  );

  // Map sessions to the result format
  // Logic for determining which provider to show:
  // - If assigned_to_specialist_id is set AND differs from provider_id → show assigned specialist (they're delivering)
  // - If assigned_to_specialist_id is not set (including SEA assignments) → show the original provider_id
  const sessionsWithDetails: SessionWithDetails[] = sessions
    .filter(session => session.provider_id && session.student_id)
    .map(session => {
      // Determine the delivering provider
      // Only show as "assigned" if delegated to a DIFFERENT specialist (not when assigned_to_specialist_id === provider_id)
      const isAssignedToSpecialist =
        !!session.assigned_to_specialist_id &&
        session.assigned_to_specialist_id !== session.provider_id;
      const deliveringProviderId = isAssignedToSpecialist
        ? session.assigned_to_specialist_id!
        : session.provider_id!;

      const provider = providerMap.get(deliveringProviderId) || {
        id: deliveringProviderId,
        full_name: 'Unknown Provider',
        role: 'specialist'
      };
      const student = studentMap.get(session.student_id!) || {
        id: session.student_id!,
        initials: '??',
        grade_level: '?'
      };

      return {
        id: session.id,
        start_time: session.start_time!,
        end_time: session.end_time!,
        service_type: session.service_type,
        provider,
        student,
        isAssigned: isAssignedToSpecialist
      };
    });

  return {
    sessions: sessionsWithDetails,
    isWeekend: false,
    holiday: null
  };
}
