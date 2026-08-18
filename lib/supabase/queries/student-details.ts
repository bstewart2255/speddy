import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';
import type { Json } from '../../../src/types/database';

export interface StudentDetails {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  /**
   * SPE-339: the district's own student id. This one field lives on
   * `students.district_student_id`, NOT on `student_details` — it is the key the
   * importer and the future SIS sync match on, so it belongs beside the student
   * row itself. It is carried on this interface so the details modal, the only
   * place it is shown, keeps a single load/save call.
   *
   * It replaces the old `student_details.district_id` box, which was never
   * populated by anything (every non-sim row in production is an empty string)
   * and shared a name with the ORG-level district id used for scoping. That
   * column is retired in SPE-341.
   */
  district_student_id: string;
  upcoming_iep_date: string;
  upcoming_triennial_date: string;
  iep_goals: string[];
  accommodations: string[];
  goals_iep_date?: string; // The IEP date from imported SEIS report, for validation warnings
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
  // The two reads are independent — the district student id lives on `students`
  // (SPE-339), the rest on `student_details` — so they run together rather than
  // costing the details modal two sequential round trips on every open.
  const [fetchResult, idResult] = await Promise.all([
    safeQuery(
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
    ),
    safeQuery(
      async () => {
        const { data: row, error } = await supabase
          .from('students')
          .select('district_student_id')
          .eq('id', studentId)
          .maybeSingle();
        if (error) throw error;
        return row;
      },
      { operation: 'fetch_district_student_id', studentId }
    ),
  ]);
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching student details:', fetchResult.error);
    throw fetchResult.error;
  }

  const data = fetchResult.data;
  // A failed lookup must not silently become '' — the caller saves what it
  // loaded, so a swallowed error here would erase a stored id on the next save.
  if (idResult.error) {
    console.error('Error fetching district student id:', idResult.error);
    throw idResult.error;
  }
  const districtStudentId = idResult.data?.district_student_id || '';

  // A student with no `student_details` row yet (pre-existing rows, plus
  // roster-template and manual-add students — see SPE-284) still has a district
  // student id, because that lives on `students`. Returning null here would make
  // the details modal fall back to a blank form and then write that blank back
  // over a real id on the next save. So: no details row is not "nothing to
  // show" — return the empty detail fields WITH the real id.
  if (!data) {
    // No details row AND no student row — the student genuinely isn't there.
    if (!idResult.data) return null;
    return {
      first_name: '',
      last_name: '',
      date_of_birth: '',
      district_student_id: districtStudentId,
      upcoming_iep_date: '',
      upcoming_triennial_date: '',
      iep_goals: [],
      accommodations: [],
      goals_iep_date: undefined,
    };
  }

  // Cast to include fields added in later migrations
  const dataWithExtras = data as typeof data & {
    accommodations?: string[] | null;
    goals_iep_date?: string | null;
  };

  return {
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    date_of_birth: data.date_of_birth || '',
    district_student_id: districtStudentId,
    upcoming_iep_date: data.upcoming_iep_date || '',
    upcoming_triennial_date: data.upcoming_triennial_date || '',
    iep_goals: data.iep_goals || [],
    accommodations: dataWithExtras.accommodations || [],
    goals_iep_date: dataWithExtras.goals_iep_date || undefined
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
      // SPE-339: the district student id lives on `students`, so this save spans
      // two tables and cannot be one statement. The id goes FIRST deliberately:
      // it is the only part that can be rejected by a constraint (the
      // ux_students_provider_district_student_id uniqueness backstop), so
      // failing here leaves nothing written at all. The reverse order would
      // commit the name/date edits and then fail, leaving a partial save behind
      // a generic error with no way for the user to tell what landed.
      //
      // Blank clears the id, so an admin can remove a wrong one. NULL (not '')
      // keeps it out of the uniqueness index.
      const { error: idError } = await supabase
        .from('students')
        .update({ district_student_id: details.district_student_id?.trim() || null })
        .eq('id', studentId);
      if (idError) {
        // Name the actual problem — "Failed to save" gives the user nothing to
        // act on, and retrying the same duplicate fails identically.
        if (idError.code === '23505') {
          throw new Error(
            `Student ID "${details.district_student_id?.trim()}" is already assigned to another student on your caseload. Each student needs a unique ID.`
          );
        }
        throw idError;
      }

      const { error } = await supabase
        .from('student_details')
        .upsert({
          student_id: studentId,
          first_name: details.first_name,
          last_name: details.last_name,
          date_of_birth: details.date_of_birth || null,
          upcoming_iep_date: details.upcoming_iep_date || null,
          upcoming_triennial_date: details.upcoming_triennial_date || null,
          iep_goals: details.iep_goals,
          accommodations: details.accommodations,
          goals_iep_date: details.goals_iep_date || null,
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

/**
 * Write just a student's name into `student_details`.
 *
 * The manual add form (SPE-284 made the name the identity anchor) collects a
 * first and last name and derives the initials from them, so a brand-new
 * student needs its name row written the moment it is created. It does NOT go
 * through `upsertStudentDetails`: that one carries the whole IEP record and
 * spans two tables — it would clear a `district_student_id` the student never
 * had and blank out date/goal columns to say nothing new. One statement, one
 * table, and the `AFTER INSERT` trigger on `student_details` mirrors the name
 * onto the linked child record.
 *
 * Upsert rather than insert so a re-run cannot fail on the `student_id`
 * uniqueness constraint.
 */
export async function saveStudentName(
  studentId: string,
  firstName: string,
  lastName: string
): Promise<void> {
  const supabase = createClient<Database>();

  const savePerf = measurePerformanceWithAlerts('save_student_name', 'database');
  const saveResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('student_details')
        .upsert(
          {
            student_id: studentId,
            first_name: firstName,
            last_name: lastName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'student_id' }
        );
      if (error) throw error;
      return null;
    },
    { operation: 'save_student_name', studentId }
  );
  savePerf.end({ success: !saveResult.error });

  if (saveResult.error) {
    console.error('Error saving student name:', saveResult.error);
    throw saveResult.error;
  }
}

// =============================================================================
// STUDENT PROGRESS DATA
// =============================================================================

export interface GoalSummary {
  goalIndex: number;
  goalText: string;
  manualProgressCount: number;
  manualProgressAverage: number | null;
}

export interface TimelineItem {
  id: string;
  date: string;
  goalIndex: number;
  goalText: string;
  score: number;
  source?: string;
  notes?: string;
}

export interface StudentProgressData {
  goalSummaries: GoalSummary[];
  totals: {
    totalAssessments: number;
    overallAccuracy: number | null;
  };
  timeline: TimelineItem[];
}

// Type for manual goal progress query result
type ManualGoalProgressRecord = Pick<
  Database['public']['Tables']['manual_goal_progress']['Row'],
  'id' | 'iep_goal_index' | 'score' | 'observation_date' | 'source' | 'notes'
>;

/**
 * Retrieves manual goal-progress data for a student.
 * Returns all-time per-goal summaries and the last 30 days of entries.
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

  // Calculate 30 days ago for the timeline filter. Normalize to local midnight
  // so a date-only observation_date exactly 30 days old still passes the >=.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const manualProgressResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('manual_goal_progress')
        .select('id, iep_goal_index, score, observation_date, source, notes')
        .eq('student_id', studentId);
      if (error) throw error;
      return (data || []) as ManualGoalProgressRecord[];
    },
    { operation: 'fetch_manual_goal_progress', studentId }
  );

  fetchPerf.end({ success: !manualProgressResult.error });

  if (manualProgressResult.error) {
    console.error('Error fetching manual goal progress:', manualProgressResult.error);
    throw manualProgressResult.error;
  }

  const manualProgressResults: ManualGoalProgressRecord[] = manualProgressResult.data || [];

  // Aggregate by goal
  const goalMap = new Map<number, { manualScores: number[]; goalText: string }>();

  // Initialize with IEP goals
  iepGoals.forEach((goalText, index) => {
    goalMap.set(index, { manualScores: [], goalText });
  });

  for (const result of manualProgressResults) {
    const goalIndex = result.iep_goal_index;
    if (!goalMap.has(goalIndex)) {
      goalMap.set(goalIndex, {
        manualScores: [],
        goalText: iepGoals[goalIndex] || `Goal ${goalIndex + 1}`,
      });
    }
    goalMap.get(goalIndex)!.manualScores.push(result.score);
  }

  // Build goal summaries
  const goalSummaries: GoalSummary[] = [];
  let totalScore = 0;
  let totalCount = 0;

  for (const [goalIndex, data] of goalMap) {
    const manualCount = data.manualScores.length;
    const manualAverage = manualCount > 0
      ? Math.round(data.manualScores.reduce((a, b) => a + b, 0) / manualCount)
      : null;

    totalScore += data.manualScores.reduce((a, b) => a + b, 0);
    totalCount += manualCount;

    goalSummaries.push({
      goalIndex,
      goalText: data.goalText,
      manualProgressCount: manualCount,
      manualProgressAverage: manualAverage,
    });
  }

  // Sort by goal index
  goalSummaries.sort((a, b) => a.goalIndex - b.goalIndex);

  // Build timeline (last 30 days)
  // Parse DATE as local date by appending T00:00:00 to avoid timezone issues
  const timeline: TimelineItem[] = [];
  for (const result of manualProgressResults) {
    const observationDate = new Date(`${result.observation_date}T00:00:00`);
    if (observationDate >= thirtyDaysAgo) {
      const goalIndex = result.iep_goal_index;
      timeline.push({
        id: result.id,
        date: result.observation_date,
        goalIndex,
        goalText: goalMap.get(goalIndex)?.goalText || `Goal ${goalIndex + 1}`,
        score: result.score,
        source: result.source || undefined,
        notes: result.notes || undefined,
      });
    }
  }

  // Sort timeline by date descending (most recent first)
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    goalSummaries,
    totals: {
      totalAssessments: manualProgressResults.length,
      overallAccuracy: totalCount > 0 ? Math.round(totalScore / totalCount) : null,
    },
    timeline,
  };
}
