import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';

export interface StudentAssessment {
  // Reading Assessments
  dibels_wpm_accuracy?: number | null;
  dibels_nonsense_word_fluency?: number | null;
  reading_comprehension_accuracy?: number | null;
  lexile_level?: string | null;
  fp_dra_level?: string | null;
  phoneme_segmentation_fluency?: number | null;
  sight_words_known?: number | null;
  sight_words_list_level?: string | null;
  
  // Math Assessments
  math_computation_addition_accuracy?: number | null;
  math_computation_subtraction_accuracy?: number | null;
  math_computation_multiplication_accuracy?: number | null;
  math_computation_division_accuracy?: number | null;
  math_fact_fluency_addition?: number | null;
  math_fact_fluency_subtraction?: number | null;
  math_fact_fluency_multiplication?: number | null;
  math_fact_fluency_division?: number | null;
  math_problem_solving_accuracy?: number | null;
  math_number_sense_score?: number | null;
  
  // Writing Assessments
  spelling_developmental_stage?: string | null;
  spelling_accuracy?: number | null;
  written_expression_score?: number | null;
  words_per_sentence_average?: number | null;
  handwriting_letters_per_minute?: number | null;
  
  // Cognitive Assessments
  wisc_processing_speed_index?: number | null;
  wisc_working_memory_index?: number | null;
  wisc_fluid_reasoning_index?: number | null;
  
  // Academic Achievement
  academic_fluency_score?: number | null;
  processing_speed_score?: number | null;
  cognitive_efficiency_score?: number | null;
  
  // Executive Function
  brief_working_memory_tscore?: number | null;
  brief_inhibition_tscore?: number | null;
  brief_shift_flexibility_tscore?: number | null;
  
  // Memory Assessments
  immediate_recall_score?: number | null;
  delayed_recall_score?: number | null;
  recognition_score?: number | null;
  
  // Metadata
  assessment_date?: string | null;
}

export async function getStudentAssessment(studentId: string): Promise<StudentAssessment | null> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_student_assessment', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_assessments')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { 
      operation: 'fetch_student_assessment', 
      studentId 
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching student assessment:', fetchResult.error);
    throw fetchResult.error;
  }

  const data = fetchResult.data;
  if (!data) return null;

  // Return all assessment fields
  return {
    dibels_wpm_accuracy: data.dibels_wpm_accuracy,
    dibels_nonsense_word_fluency: data.dibels_nonsense_word_fluency,
    reading_comprehension_accuracy: data.reading_comprehension_accuracy,
    lexile_level: data.lexile_level,
    fp_dra_level: data.fp_dra_level,
    phoneme_segmentation_fluency: data.phoneme_segmentation_fluency,
    sight_words_known: data.sight_words_known,
    sight_words_list_level: data.sight_words_list_level,
    math_computation_addition_accuracy: data.math_computation_addition_accuracy,
    math_computation_subtraction_accuracy: data.math_computation_subtraction_accuracy,
    math_computation_multiplication_accuracy: data.math_computation_multiplication_accuracy,
    math_computation_division_accuracy: data.math_computation_division_accuracy,
    math_fact_fluency_addition: data.math_fact_fluency_addition,
    math_fact_fluency_subtraction: data.math_fact_fluency_subtraction,
    math_fact_fluency_multiplication: data.math_fact_fluency_multiplication,
    math_fact_fluency_division: data.math_fact_fluency_division,
    math_problem_solving_accuracy: data.math_problem_solving_accuracy,
    math_number_sense_score: data.math_number_sense_score,
    spelling_developmental_stage: data.spelling_developmental_stage,
    spelling_accuracy: data.spelling_accuracy,
    written_expression_score: data.written_expression_score,
    words_per_sentence_average: data.words_per_sentence_average,
    handwriting_letters_per_minute: data.handwriting_letters_per_minute,
    wisc_processing_speed_index: data.wisc_processing_speed_index,
    wisc_working_memory_index: data.wisc_working_memory_index,
    wisc_fluid_reasoning_index: data.wisc_fluid_reasoning_index,
    academic_fluency_score: data.academic_fluency_score,
    processing_speed_score: data.processing_speed_score,
    cognitive_efficiency_score: data.cognitive_efficiency_score,
    brief_working_memory_tscore: data.brief_working_memory_tscore,
    brief_inhibition_tscore: data.brief_inhibition_tscore,
    brief_shift_flexibility_tscore: data.brief_shift_flexibility_tscore,
    immediate_recall_score: data.immediate_recall_score,
    delayed_recall_score: data.delayed_recall_score,
    recognition_score: data.recognition_score,
    assessment_date: data.assessment_date,
  };
}

export async function upsertStudentAssessment(
  studentId: string, 
  assessment: StudentAssessment
): Promise<void> {
  const supabase = createClient<Database>();

  const upsertPerf = measurePerformanceWithAlerts('upsert_student_assessment', 'database');
  const upsertResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('student_assessments')
        .upsert({
          student_id: studentId,
          ...assessment,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'student_id'
        });
      if (error) throw error;
      return null;
    },
    { 
      operation: 'upsert_student_assessment', 
      studentId
    }
  );
  upsertPerf.end({ success: !upsertResult.error });

  if (upsertResult.error) {
    console.error('Error saving student assessment:', upsertResult.error);
    throw upsertResult.error;
  }
}