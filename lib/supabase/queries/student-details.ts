import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';
import type { Json } from '../../../src/types/database';

export interface StudentDetails {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  district_id: string;
  upcoming_iep_date: string;
  upcoming_triennial_date: string;
  iep_goals: string[];
  accommodations: string[];
}

/**
 * Safely converts a Json value to a string array.
 * Filters out any non-string values and handles null/undefined cases.
 *
 * @param jsonValue - The Json value from the database (can be array, object, or primitive)
 * @returns Array of strings, or empty array if input is null/undefined/invalid
 */
function jsonToStringArray(value: Json | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

/**
 * Retrieves detailed student information from the student_details table.
 *
 * @param studentId - UUID of the student to fetch details for
 * @returns StudentDetails object with IEP information, or null if no details found
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const details = await getStudentDetails('student-uuid');
 * if (details) {
 *   console.log(`IEP Goals: ${details.iep_goals.join(', ')}`);
 * }
 * ```
 */
export async function getStudentDetails(studentId: string): Promise<StudentDetails | null> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_student_details', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_details')
        .select('*')
        .eq('student_id', studentId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { 
      operation: 'fetch_student_details', 
      studentId 
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching student details:', fetchResult.error);
    throw fetchResult.error;
  }

  const data = fetchResult.data;
  if (!data) return null;

  // Cast to include accommodations field (added in migration 20251211_add_student_accommodations)
  const dataWithAccommodations = data as typeof data & { accommodations?: string[] | null };

  return {
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    date_of_birth: data.date_of_birth || '',
    district_id: data.district_id || '',
    upcoming_iep_date: data.upcoming_iep_date || '',
    upcoming_triennial_date: data.upcoming_triennial_date || '',
    iep_goals: data.iep_goals || [],
    accommodations: dataWithAccommodations.accommodations || []
  };
}

/**
 * Finds provider roles for other students matching the same criteria.
 * Used to show "Also seen by: Speech, OT" badge in student details modal.
 *
 * Matches on: initials (case-insensitive), school_id, grade_level, teacher
 *
 * @param studentId - UUID of the student to find matches for
 * @returns Array of role strings (e.g., ['speech', 'ot'])
 */
export async function getMatchingProviderRoles(studentId: string): Promise<string[]> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_matching_provider_roles', 'database');
  const fetchResult = await safeQuery(
    async () => {
      // Note: 'find_matching_provider_roles' is defined in migration 20251230_add_find_matching_provider_roles_function.sql
      // Using type assertion since the RPC function may not be in generated types yet
      const { data, error } = await (supabase.rpc as any)('find_matching_provider_roles', {
        p_student_id: studentId
      });
      if (error) throw error;
      return data as string[] | null;
    },
    {
      operation: 'find_matching_provider_roles',
      studentId
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching matching provider roles:', fetchResult.error);
    return [];
  }

  return fetchResult.data || [];
}

/**
 * Creates or updates student details in the student_details table.
 * Uses an upsert operation to handle both new records and updates to existing ones.
 *
 * @param studentId - UUID of the student to upsert details for
 * @param details - StudentDetails object containing IEP information, goals, and skills
 * @throws Error if database operation fails
 *
 * @example
 * ```typescript
 * await upsertStudentDetails('student-uuid', {
 *   first_name: 'John',
 *   last_name: 'Doe',
 *   iep_goals: ['Reading comprehension', 'Math fluency']
 * });
 * ```
 */
export async function upsertStudentDetails(
  studentId: string,
  details: StudentDetails
): Promise<void> {
  const supabase = createClient<Database>();

  const upsertPerf = measurePerformanceWithAlerts('upsert_student_details', 'database');
  const upsertResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('student_details')
        .upsert({
          student_id: studentId,
          first_name: details.first_name,
          last_name: details.last_name,
          date_of_birth: details.date_of_birth || null,
          district_id: details.district_id,
          upcoming_iep_date: details.upcoming_iep_date || null,
          upcoming_triennial_date: details.upcoming_triennial_date || null,
          iep_goals: details.iep_goals,
          accommodations: details.accommodations,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'student_id'  // Add this to specify the conflict column
        });
      if (error) throw error;
      return null;
    },
    {
      operation: 'upsert_student_details',
      studentId,
      hasFirstName: !!details.first_name,
      hasLastName: !!details.last_name,
      hasDateOfBirth: !!details.date_of_birth,
      hasIepDate: !!details.upcoming_iep_date,
      hasTriennialDate: !!details.upcoming_triennial_date,
      iepGoalsCount: details.iep_goals.length,
      accommodationsCount: details.accommodations.length
    }
  );
  upsertPerf.end({ success: !upsertResult.error });

  if (upsertResult.error) {
    const error = upsertResult.error as import('@supabase/supabase-js').PostgrestError;
    console.error('Error saving student details:', error);
    console.error('Error details:', error.message, error.details, error.hint);
    throw upsertResult.error;
  }
}

// =============================================================================
// STUDENT PROGRESS DATA
// =============================================================================

export interface GoalSummary {
  goalIndex: number;
  goalText: string;
  progressCheckAccuracy: number | null;
  progressCheckCount: number;
  progressCheckCorrect: number;
  progressCheckTotal: number;
  exitTicketAccuracy: number | null;
  exitTicketCount: number;
  exitTicketCorrect: number;
  exitTicketTotal: number;
  combinedAccuracy: number | null;
}

export interface TimelineItem {
  id: string;
  type: 'progress_check' | 'exit_ticket';
  date: string;
  goalIndex: number;
  goalText: string;
  correct: number;
  incorrect: number;
  excluded: number;
  notes?: string;
}

export interface StudentProgressData {
  goalSummaries: GoalSummary[];
  totals: {
    totalAssessments: number;
    overallAccuracy: number | null;
    totalCorrect: number;
    totalGraded: number;
  };
  timeline: TimelineItem[];
}

/**
 * Retrieves progress data for a student including Progress Check and Exit Ticket results.
 * Returns all-time summary stats and last 30 days of timeline items.
 *
 * @param studentId - UUID of the student
 * @param iepGoals - Array of IEP goal texts for this student
 * @returns StudentProgressData with summaries and timeline
 */
export async function getStudentProgressData(
  studentId: string,
  iepGoals: string[]
): Promise<StudentProgressData> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_student_progress_data', 'database');

  // Calculate 30 days ago for timeline filter
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch progress check and exit ticket results in parallel (both queries are independent)
  const [progressCheckResult, exitTicketResult] = await Promise.all([
    safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('progress_check_results')
          .select('id, iep_goal_index, status, notes, graded_at, progress_check_id')
          .eq('student_id', studentId);
        if (error) throw error;
        return data || [];
      },
      { operation: 'fetch_progress_check_results', studentId }
    ),
    safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('exit_ticket_results')
          .select('id, iep_goal_index, iep_goal_text, status, notes, graded_at, exit_ticket_id')
          .eq('student_id', studentId);
        if (error) throw error;
        return data || [];
      },
      { operation: 'fetch_exit_ticket_results', studentId }
    ),
  ]);

  fetchPerf.end({ success: !progressCheckResult.error && !exitTicketResult.error });

  if (progressCheckResult.error) {
    console.error('Error fetching progress check results:', progressCheckResult.error);
    throw progressCheckResult.error;
  }

  if (exitTicketResult.error) {
    console.error('Error fetching exit ticket results:', exitTicketResult.error);
    throw exitTicketResult.error;
  }

  const progressCheckResults = progressCheckResult.data || [];
  const exitTicketResults = exitTicketResult.data || [];

  // Aggregate by goal
  const goalMap = new Map<number, {
    pcCorrect: number;
    pcIncorrect: number;
    pcExcluded: number;
    etCorrect: number;
    etIncorrect: number;
    etExcluded: number;
    goalText: string;
  }>();

  // Initialize with IEP goals
  iepGoals.forEach((goalText, index) => {
    goalMap.set(index, {
      pcCorrect: 0,
      pcIncorrect: 0,
      pcExcluded: 0,
      etCorrect: 0,
      etIncorrect: 0,
      etExcluded: 0,
      goalText,
    });
  });

  // Aggregate progress check results
  for (const result of progressCheckResults) {
    const goalIndex = result.iep_goal_index;
    if (!goalMap.has(goalIndex)) {
      goalMap.set(goalIndex, {
        pcCorrect: 0, pcIncorrect: 0, pcExcluded: 0,
        etCorrect: 0, etIncorrect: 0, etExcluded: 0,
        goalText: iepGoals[goalIndex] || `Goal ${goalIndex + 1}`,
      });
    }
    const goal = goalMap.get(goalIndex)!;
    if (result.status === 'correct') goal.pcCorrect++;
    else if (result.status === 'incorrect') goal.pcIncorrect++;
    else if (result.status === 'excluded') goal.pcExcluded++;
  }

  // Aggregate exit ticket results
  for (const result of exitTicketResults) {
    const goalIndex = result.iep_goal_index;
    if (!goalMap.has(goalIndex)) {
      goalMap.set(goalIndex, {
        pcCorrect: 0, pcIncorrect: 0, pcExcluded: 0,
        etCorrect: 0, etIncorrect: 0, etExcluded: 0,
        goalText: result.iep_goal_text || iepGoals[goalIndex] || `Goal ${goalIndex + 1}`,
      });
    }
    const goal = goalMap.get(goalIndex)!;
    if (result.status === 'correct') goal.etCorrect++;
    else if (result.status === 'incorrect') goal.etIncorrect++;
    else if (result.status === 'excluded') goal.etExcluded++;
  }

  // Build goal summaries
  const goalSummaries: GoalSummary[] = [];
  let totalCorrect = 0;
  let totalGraded = 0;

  for (const [goalIndex, data] of goalMap) {
    const pcTotal = data.pcCorrect + data.pcIncorrect;
    const pcAccuracy = pcTotal > 0 ? Math.round((data.pcCorrect / pcTotal) * 100) : null;

    const etTotal = data.etCorrect + data.etIncorrect;
    const etAccuracy = etTotal > 0 ? Math.round((data.etCorrect / etTotal) * 100) : null;

    const combinedTotal = pcTotal + etTotal;
    const combinedCorrect = data.pcCorrect + data.etCorrect;
    const combinedAccuracy = combinedTotal > 0 ? Math.round((combinedCorrect / combinedTotal) * 100) : null;

    totalCorrect += combinedCorrect;
    totalGraded += combinedTotal;

    goalSummaries.push({
      goalIndex,
      goalText: data.goalText,
      progressCheckAccuracy: pcAccuracy,
      progressCheckCount: data.pcCorrect + data.pcIncorrect + data.pcExcluded,
      progressCheckCorrect: data.pcCorrect,
      progressCheckTotal: pcTotal,
      exitTicketAccuracy: etAccuracy,
      exitTicketCount: data.etCorrect + data.etIncorrect + data.etExcluded,
      exitTicketCorrect: data.etCorrect,
      exitTicketTotal: etTotal,
      combinedAccuracy,
    });
  }

  // Sort by goal index
  goalSummaries.sort((a, b) => a.goalIndex - b.goalIndex);

  // Build timeline (last 30 days)
  const timeline: TimelineItem[] = [];

  // Group progress check results by progress_check_id AND iep_goal_index for timeline
  // (a single progress check can have questions for multiple IEP goals)
  const pcByCheckAndGoal = new Map<string, typeof progressCheckResults>();
  for (const result of progressCheckResults) {
    if (result.graded_at && new Date(result.graded_at) >= thirtyDaysAgo) {
      const key = `${result.progress_check_id}-${result.iep_goal_index}`;
      if (!pcByCheckAndGoal.has(key)) {
        pcByCheckAndGoal.set(key, []);
      }
      pcByCheckAndGoal.get(key)!.push(result);
    }
  }

  // Add progress check timeline items (one per goal per check)
  for (const [key, results] of pcByCheckAndGoal) {
    if (results.length === 0) continue;
    const goalIndex = results[0].iep_goal_index;
    const goalText = goalMap.get(goalIndex)?.goalText || `Goal ${goalIndex + 1}`;
    const correct = results.filter(r => r.status === 'correct').length;
    const incorrect = results.filter(r => r.status === 'incorrect').length;
    const excluded = results.filter(r => r.status === 'excluded').length;
    const notes = results.filter(r => r.notes).map(r => r.notes).join('; ') || undefined;

    timeline.push({
      id: key, // Use composite key for uniqueness
      type: 'progress_check',
      date: results[0].graded_at!,
      goalIndex,
      goalText,
      correct,
      incorrect,
      excluded,
      notes,
    });
  }

  // Group exit ticket results by exit_ticket_id for timeline
  const etByTicket = new Map<string, typeof exitTicketResults>();
  for (const result of exitTicketResults) {
    if (result.graded_at && new Date(result.graded_at) >= thirtyDaysAgo) {
      const ticketId = result.exit_ticket_id;
      if (!etByTicket.has(ticketId)) {
        etByTicket.set(ticketId, []);
      }
      etByTicket.get(ticketId)!.push(result);
    }
  }

  // Add exit ticket timeline items
  for (const [ticketId, results] of etByTicket) {
    if (results.length === 0) continue;
    const goalIndex = results[0].iep_goal_index;
    const goalText = results[0].iep_goal_text || goalMap.get(goalIndex)?.goalText || `Goal ${goalIndex + 1}`;
    const correct = results.filter(r => r.status === 'correct').length;
    const incorrect = results.filter(r => r.status === 'incorrect').length;
    const excluded = results.filter(r => r.status === 'excluded').length;
    const notes = results.filter(r => r.notes).map(r => r.notes).join('; ') || undefined;

    timeline.push({
      id: ticketId,
      type: 'exit_ticket',
      date: results[0].graded_at!,
      goalIndex,
      goalText,
      correct,
      incorrect,
      excluded,
      notes,
    });
  }

  // Sort timeline by date descending (most recent first)
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Count unique assessments (progress checks + exit tickets)
  const uniqueProgressChecks = new Set(progressCheckResults.map(r => r.progress_check_id)).size;
  const uniqueExitTickets = new Set(exitTicketResults.map(r => r.exit_ticket_id)).size;

  return {
    goalSummaries,
    totals: {
      totalAssessments: uniqueProgressChecks + uniqueExitTickets,
      overallAccuracy: totalGraded > 0 ? Math.round((totalCorrect / totalGraded) * 100) : null,
      totalCorrect,
      totalGraded,
    },
    timeline,
  };
}