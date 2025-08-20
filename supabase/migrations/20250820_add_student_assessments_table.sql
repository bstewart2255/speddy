-- Add student_assessments table for comprehensive assessment data
-- Migration: 20250820_add_student_assessments_table.sql

-- Create the student_assessments table
CREATE TABLE student_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  
  -- Reading Assessments
  dibels_wpm_accuracy NUMERIC,
  dibels_nonsense_word_fluency NUMERIC,
  reading_comprehension_accuracy NUMERIC,
  lexile_level VARCHAR(20),
  fp_dra_level VARCHAR(20),
  phoneme_segmentation_fluency NUMERIC,
  sight_words_known INTEGER,
  sight_words_list_level VARCHAR(50),
  
  -- Math Assessments
  math_computation_addition_accuracy NUMERIC,
  math_computation_subtraction_accuracy NUMERIC,
  math_computation_multiplication_accuracy NUMERIC,
  math_computation_division_accuracy NUMERIC,
  math_fact_fluency_addition NUMERIC,
  math_fact_fluency_subtraction NUMERIC,
  math_fact_fluency_multiplication NUMERIC,
  math_fact_fluency_division NUMERIC,
  math_problem_solving_accuracy NUMERIC,
  math_number_sense_score NUMERIC,
  
  -- Writing Assessments
  spelling_developmental_stage VARCHAR(50),
  spelling_accuracy NUMERIC,
  written_expression_score NUMERIC,
  words_per_sentence_average NUMERIC,
  handwriting_letters_per_minute NUMERIC,
  
  -- Cognitive Assessments (WISC-V)
  wisc_processing_speed_index INTEGER,
  wisc_working_memory_index INTEGER,
  wisc_fluid_reasoning_index INTEGER,
  
  -- Academic Achievement (WJ-IV, KTEA-3)
  academic_fluency_score INTEGER,
  processing_speed_score INTEGER,
  cognitive_efficiency_score INTEGER,
  
  -- Executive Function (BRIEF-2)
  brief_working_memory_tscore INTEGER,
  brief_inhibition_tscore INTEGER,
  brief_shift_flexibility_tscore INTEGER,
  
  -- Memory Assessments
  immediate_recall_score INTEGER,
  delayed_recall_score INTEGER,
  recognition_score INTEGER,
  
  -- Metadata
  assessment_date DATE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for common queries
CREATE INDEX idx_student_assessments_student_id ON student_assessments(student_id);
CREATE INDEX idx_student_assessments_date ON student_assessments(assessment_date DESC);

-- Add comments for documentation
COMMENT ON TABLE student_assessments IS 'Comprehensive assessment data for students to enable personalized AI lesson generation';

-- Reading assessment comments
COMMENT ON COLUMN student_assessments.dibels_wpm_accuracy IS 'DIBELS Words Per Minute accuracy percentage';
COMMENT ON COLUMN student_assessments.dibels_nonsense_word_fluency IS 'DIBELS Nonsense Word Fluency score';
COMMENT ON COLUMN student_assessments.reading_comprehension_accuracy IS 'Reading comprehension accuracy percentage';
COMMENT ON COLUMN student_assessments.lexile_level IS 'Lexile reading level (e.g., 450L)';
COMMENT ON COLUMN student_assessments.fp_dra_level IS 'Fountas & Pinnell or DRA reading level';
COMMENT ON COLUMN student_assessments.phoneme_segmentation_fluency IS 'PSF score for phonemic awareness';
COMMENT ON COLUMN student_assessments.sight_words_known IS 'Number of sight words known';
COMMENT ON COLUMN student_assessments.sight_words_list_level IS 'Sight word list level (Dolch/Fry)';

-- Math assessment comments
COMMENT ON COLUMN student_assessments.math_computation_addition_accuracy IS 'Addition computation accuracy percentage';
COMMENT ON COLUMN student_assessments.math_computation_subtraction_accuracy IS 'Subtraction computation accuracy percentage';
COMMENT ON COLUMN student_assessments.math_computation_multiplication_accuracy IS 'Multiplication computation accuracy percentage';
COMMENT ON COLUMN student_assessments.math_computation_division_accuracy IS 'Division computation accuracy percentage';
COMMENT ON COLUMN student_assessments.math_fact_fluency_addition IS 'Addition facts per minute';
COMMENT ON COLUMN student_assessments.math_fact_fluency_subtraction IS 'Subtraction facts per minute';
COMMENT ON COLUMN student_assessments.math_fact_fluency_multiplication IS 'Multiplication facts per minute';
COMMENT ON COLUMN student_assessments.math_fact_fluency_division IS 'Division facts per minute';
COMMENT ON COLUMN student_assessments.math_problem_solving_accuracy IS 'Word problem solving accuracy percentage';
COMMENT ON COLUMN student_assessments.math_number_sense_score IS 'TEMA-3 or similar number sense composite score';

-- Writing assessment comments
COMMENT ON COLUMN student_assessments.spelling_developmental_stage IS 'Words Their Way developmental spelling stage';
COMMENT ON COLUMN student_assessments.spelling_accuracy IS 'Spelling accuracy percentage';
COMMENT ON COLUMN student_assessments.written_expression_score IS 'WJ-IV written expression score';
COMMENT ON COLUMN student_assessments.words_per_sentence_average IS 'Average words per sentence in writing samples';
COMMENT ON COLUMN student_assessments.handwriting_letters_per_minute IS 'Legible letters written per minute';

-- Cognitive assessment comments
COMMENT ON COLUMN student_assessments.wisc_processing_speed_index IS 'WISC-V PSI standard score (mean=100)';
COMMENT ON COLUMN student_assessments.wisc_working_memory_index IS 'WISC-V WMI standard score (mean=100)';
COMMENT ON COLUMN student_assessments.wisc_fluid_reasoning_index IS 'WISC-V FRI standard score (mean=100)';

-- Enable RLS
ALTER TABLE student_assessments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their students' assessments" ON student_assessments
  FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students 
      WHERE provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert assessments for their students" ON student_assessments
  FOR INSERT
  WITH CHECK (
    student_id IN (
      SELECT id FROM students 
      WHERE provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their students' assessments" ON student_assessments
  FOR UPDATE
  USING (
    student_id IN (
      SELECT id FROM students 
      WHERE provider_id = auth.uid()
    )
  )
  WITH CHECK (
    student_id IN (
      SELECT id FROM students 
      WHERE provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their students' assessments" ON student_assessments
  FOR DELETE
  USING (
    student_id IN (
      SELECT id FROM students 
      WHERE provider_id = auth.uid()
    )
  );

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_student_assessments_updated_at
  BEFORE UPDATE ON student_assessments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();