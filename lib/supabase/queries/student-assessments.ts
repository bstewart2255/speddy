import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';
import type {
  StudentAssessment,
  CreateAssessmentInput,
  UpdateAssessmentInput,
  AssessmentType,
  AssessmentData,
} from '@/types/student-assessments';

/**
 * Get all assessments for a student
 * @param studentId The student's ID
 * @returns Array of assessments, ordered by date (most recent first)
 */
export async function getStudentAssessments(studentId: string): Promise<StudentAssessment[]> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_student_assessments', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_assessments')
        .select('*')
        .eq('student_id', studentId)
        .order('assessment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_student_assessments',
      studentId
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching student assessments:', fetchResult.error);
    throw fetchResult.error;
  }

  const data = fetchResult.data || [];

  // Map database records to StudentAssessment type
  return data.map(record => ({
    id: record.id,
    studentId: record.student_id,
    assessmentType: record.assessment_type as AssessmentType,
    assessmentDate: record.assessment_date || '',
    data: record.data as AssessmentData,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }));
}

/**
 * Get assessments of a specific type for a student
 * @param studentId The student's ID
 * @param assessmentType The type of assessment to fetch
 * @returns Array of assessments of the specified type
 */
export async function getStudentAssessmentsByType(
  studentId: string,
  assessmentType: AssessmentType
): Promise<StudentAssessment[]> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_student_assessments_by_type', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_assessments')
        .select('*')
        .eq('student_id', studentId)
        .eq('assessment_type', assessmentType)
        .order('assessment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_student_assessments_by_type',
      studentId,
      assessmentType
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching student assessments by type:', fetchResult.error);
    throw fetchResult.error;
  }

  const data = fetchResult.data || [];

  return data.map(record => ({
    id: record.id,
    studentId: record.student_id,
    assessmentType: record.assessment_type as AssessmentType,
    assessmentDate: record.assessment_date || '',
    data: record.data as AssessmentData,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }));
}

/**
 * Get a single assessment by ID
 * @param assessmentId The assessment ID
 * @returns The assessment or null if not found
 */
export async function getAssessmentById(assessmentId: string): Promise<StudentAssessment | null> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_assessment_by_id', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_assessments')
        .select('*')
        .eq('id', assessmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_assessment_by_id',
      assessmentId
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching assessment by ID:', fetchResult.error);
    throw fetchResult.error;
  }

  const data = fetchResult.data;
  if (!data) return null;

  return {
    id: data.id,
    studentId: data.student_id,
    assessmentType: data.assessment_type as AssessmentType,
    assessmentDate: data.assessment_date || '',
    data: data.data as AssessmentData,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Create a new assessment
 * @param assessment The assessment data to create
 * @returns The created assessment
 */
export async function createAssessment(
  assessment: CreateAssessmentInput
): Promise<StudentAssessment> {
  const supabase = createClient<Database>();

  const createPerf = measurePerformanceWithAlerts('create_student_assessment', 'database');
  const createResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_assessments')
        .insert({
          student_id: assessment.studentId,
          assessment_type: assessment.assessmentType,
          assessment_date: assessment.assessmentDate,
          data: assessment.data as any, // Cast to any for JSONB
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'create_student_assessment',
      studentId: assessment.studentId,
      assessmentType: assessment.assessmentType
    }
  );
  createPerf.end({ success: !createResult.error });

  if (createResult.error) {
    console.error('Error creating student assessment:', createResult.error);
    throw createResult.error;
  }

  const data = createResult.data!;
  return {
    id: data.id,
    studentId: data.student_id,
    assessmentType: data.assessment_type as AssessmentType,
    assessmentDate: data.assessment_date || '',
    data: data.data as AssessmentData,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Update an existing assessment
 * @param assessment The assessment data to update
 * @returns The updated assessment
 */
export async function updateAssessment(
  assessment: UpdateAssessmentInput
): Promise<StudentAssessment> {
  const supabase = createClient<Database>();

  const updatePerf = measurePerformanceWithAlerts('update_student_assessment', 'database');

  // Build the update object dynamically
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (assessment.assessmentType !== undefined) {
    updateData.assessment_type = assessment.assessmentType;
  }
  if (assessment.assessmentDate !== undefined) {
    updateData.assessment_date = assessment.assessmentDate;
  }
  if (assessment.data !== undefined) {
    updateData.data = assessment.data;
  }
  if (assessment.studentId !== undefined) {
    updateData.student_id = assessment.studentId;
  }

  const updateResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_assessments')
        .update(updateData)
        .eq('id', assessment.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'update_student_assessment',
      assessmentId: assessment.id
    }
  );
  updatePerf.end({ success: !updateResult.error });

  if (updateResult.error) {
    console.error('Error updating student assessment:', updateResult.error);
    throw updateResult.error;
  }

  const data = updateResult.data!;
  return {
    id: data.id,
    studentId: data.student_id,
    assessmentType: data.assessment_type as AssessmentType,
    assessmentDate: data.assessment_date || '',
    data: data.data as AssessmentData,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Delete an assessment
 * @param assessmentId The ID of the assessment to delete
 */
export async function deleteAssessment(assessmentId: string): Promise<void> {
  const supabase = createClient<Database>();

  const deletePerf = measurePerformanceWithAlerts('delete_student_assessment', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('student_assessments')
        .delete()
        .eq('id', assessmentId);
      if (error) throw error;
      return null;
    },
    {
      operation: 'delete_student_assessment',
      assessmentId
    }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) {
    console.error('Error deleting student assessment:', deleteResult.error);
    throw deleteResult.error;
  }
}

/**
 * Get the most recent assessment of each type for a student
 * Useful for displaying current status
 * @param studentId The student's ID
 * @returns Object with most recent assessment of each type
 */
export async function getLatestAssessmentsByType(
  studentId: string
): Promise<Partial<Record<AssessmentType, StudentAssessment>>> {
  const allAssessments = await getStudentAssessments(studentId);

  const latestByType: Partial<Record<AssessmentType, StudentAssessment>> = {};

  for (const assessment of allAssessments) {
    const type = assessment.assessmentType;
    if (!latestByType[type] ||
        assessment.assessmentDate > latestByType[type]!.assessmentDate) {
      latestByType[type] = assessment;
    }
  }

  return latestByType;
}
