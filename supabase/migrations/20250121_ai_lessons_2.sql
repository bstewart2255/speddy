-- AI Lessons 2.0 Database Schema
-- This migration adds support for enhanced AI lesson generation with differentiation and performance tracking

-- Assessment Registry: Stores different types of assessments and their interpretation rules
CREATE TABLE IF NOT EXISTS assessment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('academic', 'cognitive', 'behavioral', 'iep')),
  data_schema JSONB NOT NULL, -- JSON schema for validation
  interpretation_rules JSONB NOT NULL, -- Rules for AI to interpret this data
  prompt_fragments JSONB NOT NULL, -- Prompt pieces for this assessment type
  confidence_weight NUMERIC DEFAULT 1.0, -- How much to trust this data (0-1)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Performance Metrics: Aggregated performance data per student
CREATE TABLE IF NOT EXISTS student_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK (subject IN ('reading', 'math', 'writing', 'spelling', 'phonics')),
  current_level NUMERIC, -- Grade level equivalent (e.g., 2.5 = 2nd grade, 5th month)
  accuracy_trend JSONB, -- Array of recent accuracy percentages
  error_patterns JSONB, -- Common mistakes and their frequency
  last_assessment_date TIMESTAMPTZ,
  confidence_score NUMERIC DEFAULT 0.5, -- 0-1 confidence in the metrics
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, subject)
);

-- Lesson Adjustment Queue: Tracks pending adjustments based on performance
CREATE TABLE IF NOT EXISTS lesson_adjustment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  worksheet_submission_id UUID REFERENCES worksheet_submissions(id),
  subject TEXT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('advance', 'maintain', 'reteach', 'prerequisite')),
  adjustment_details JSONB NOT NULL, -- Specific changes to make
  priority INTEGER DEFAULT 5, -- 1-10, higher = more urgent
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Differentiated Lesson Plans: Stores generated lessons with differentiation data
CREATE TABLE IF NOT EXISTS differentiated_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  lesson_type TEXT NOT NULL CHECK (lesson_type IN ('individual', 'group')),
  student_ids UUID[] NOT NULL, -- Array of student IDs in this lesson
  differentiation_map JSONB NOT NULL, -- Maps each student to their specific materials
  whole_group_components JSONB, -- Shared components for group lessons
  teacher_guidance JSONB NOT NULL, -- Plain language notes for teachers
  data_confidence JSONB, -- Confidence levels for each data point used
  materials_included JSONB NOT NULL, -- Checklist of all included materials
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Material Generation Constraints: Rules to prevent external dependencies
CREATE TABLE IF NOT EXISTS material_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constraint_type TEXT NOT NULL CHECK (constraint_type IN ('forbidden', 'acceptable', 'required')),
  description TEXT NOT NULL,
  validation_regex TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lesson Performance History: Tracks how lessons performed for future optimization
CREATE TABLE IF NOT EXISTS lesson_performance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  differentiated_lesson_id UUID REFERENCES differentiated_lessons(id),
  student_id UUID REFERENCES students(id),
  completion_time INTEGER, -- Minutes to complete
  accuracy_percentage NUMERIC,
  engagement_level TEXT CHECK (engagement_level IN ('high', 'medium', 'low')),
  teacher_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Functions and Triggers

-- Function to automatically update performance metrics after worksheet submission
CREATE OR REPLACE FUNCTION update_performance_metrics()
RETURNS TRIGGER AS $$
DECLARE
  worksheet_record RECORD;
  subject_type TEXT;
BEGIN
  -- Get worksheet details
  SELECT w.*, s.id as student_id 
  FROM worksheets w
  JOIN students s ON w.student_id = s.id
  WHERE w.id = NEW.worksheet_id
  INTO worksheet_record;

  -- Map worksheet type to subject
  subject_type := CASE 
    WHEN worksheet_record.worksheet_type = 'spelling' THEN 'spelling'
    WHEN worksheet_record.worksheet_type = 'math' THEN 'math'
    WHEN worksheet_record.worksheet_type = 'reading_comprehension' THEN 'reading'
    WHEN worksheet_record.worksheet_type = 'phonics' THEN 'phonics'
    WHEN worksheet_record.worksheet_type = 'writing' THEN 'writing'
    ELSE 'reading' -- default
  END;

  -- Update or insert performance metrics
  INSERT INTO student_performance_metrics (
    student_id,
    subject,
    accuracy_trend,
    last_assessment_date
  ) VALUES (
    worksheet_record.student_id,
    subject_type,
    jsonb_build_array(NEW.accuracy_percentage),
    NOW()
  )
  ON CONFLICT (student_id, subject) 
  DO UPDATE SET
    accuracy_trend = 
      CASE 
        WHEN jsonb_array_length(student_performance_metrics.accuracy_trend) >= 10
        THEN jsonb_build_array(NEW.accuracy_percentage) || (
          SELECT jsonb_agg(value) FROM (
            SELECT value FROM jsonb_array_elements(student_performance_metrics.accuracy_trend) WITH ORDINALITY
            WHERE ordinality <= 9
            ORDER BY ordinality
          ) sub
        )
        ELSE jsonb_build_array(NEW.accuracy_percentage) || student_performance_metrics.accuracy_trend
      END,
    last_assessment_date = NOW(),
    updated_at = NOW();

  -- Add to adjustment queue based on performance
  INSERT INTO lesson_adjustment_queue (
    student_id,
    worksheet_submission_id,
    subject,
    adjustment_type,
    adjustment_details,
    priority
  ) VALUES (
    worksheet_record.student_id,
    NEW.id,
    subject_type,
    CASE 
      WHEN NEW.accuracy_percentage >= 90 THEN 'advance'
      WHEN NEW.accuracy_percentage >= 70 THEN 'maintain'
      WHEN NEW.accuracy_percentage >= 50 THEN 'reteach'
      ELSE 'prerequisite'
    END,
    jsonb_build_object(
      'accuracy', NEW.accuracy_percentage,
      'skills_assessed', NEW.skills_assessed,
      'ai_analysis', NEW.ai_analysis
    ),
    CASE 
      WHEN NEW.accuracy_percentage < 50 THEN 8
      WHEN NEW.accuracy_percentage < 70 THEN 6
      ELSE 4
    END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic performance updates
CREATE TRIGGER update_metrics_on_submission
AFTER INSERT ON worksheet_submissions
FOR EACH ROW
EXECUTE FUNCTION update_performance_metrics();

-- Function to get next lesson adjustments for a student
CREATE OR REPLACE FUNCTION get_pending_adjustments(p_student_id UUID)
RETURNS TABLE (
  subject TEXT,
  adjustment_type TEXT,
  adjustment_details JSONB,
  priority INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    laq.subject,
    laq.adjustment_type,
    laq.adjustment_details,
    laq.priority
  FROM lesson_adjustment_queue laq
  WHERE 
    laq.student_id = p_student_id
    AND laq.processed = FALSE
  ORDER BY laq.priority DESC, laq.created_at DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Insert default assessment types
INSERT INTO assessment_types (name, category, data_schema, interpretation_rules, prompt_fragments) VALUES
(
  'reading_level',
  'academic',
  '{"type": "object", "properties": {"grade_level": {"type": "number"}, "lexile": {"type": "number"}, "wpm": {"type": "number"}}}',
  '{"use_for": ["text_complexity", "passage_length", "vocabulary_selection"], "weight": "high"}',
  '{"pacing": "Reading at {grade_level} grade level", "complexity": "Lexile {lexile}L texts", "supports": "Include phonics support for challenging words"}'
),
(
  'math_computation',
  'academic',
  '{"type": "object", "properties": {"grade_level": {"type": "number"}, "accuracy": {"type": "number"}, "fluency": {"type": "string"}}}',
  '{"use_for": ["problem_difficulty", "number_range", "operation_types"], "weight": "high"}',
  '{"pacing": "Math at {grade_level} grade level", "complexity": "{accuracy}% accuracy baseline", "supports": "Visual number lines and step-by-step examples"}'
),
(
  'processing_speed',
  'cognitive',
  '{"type": "object", "properties": {"percentile": {"type": "number"}, "standard_score": {"type": "number"}}}',
  '{"use_for": ["worksheet_length", "time_limits", "problem_count"], "weight": "medium"}',
  '{"pacing": "Adjusted for {percentile}th percentile processing speed", "complexity": "Reduced problem count", "supports": "Clear visual organization"}'
),
(
  'working_memory',
  'cognitive',
  '{"type": "object", "properties": {"percentile": {"type": "number"}, "digit_span": {"type": "number"}}}',
  '{"use_for": ["instruction_complexity", "multi_step_problems"], "weight": "medium"}',
  '{"pacing": "Single-step instructions", "complexity": "Break complex problems into parts", "supports": "Reference charts on worksheet"}'
),
(
  'iep_goals',
  'iep',
  '{"type": "array", "items": {"type": "string"}}',
  '{"use_for": ["skill_focus", "success_criteria"], "weight": "high"}',
  '{"pacing": "Aligned to IEP goals", "complexity": "Target specific IEP objectives", "supports": "IEP accommodations included"}'
);

-- Insert default material constraints
INSERT INTO material_constraints (constraint_type, description, validation_regex) VALUES
('forbidden', 'No cutting required', 'cut\s+out|scissors|cut\s+and\s+paste'),
('forbidden', 'No physical manipulatives', 'manipulatives|blocks|counters|tiles|cards'),
('forbidden', 'No technology requirements', 'app|website|computer|tablet|online'),
('forbidden', 'No movement activities', 'stand\s+up|walk\s+around|move\s+to|gallery\s+walk'),
('forbidden', 'No laminating needed', 'laminate|dry\s+erase|reusable'),
('acceptable', 'Basic classroom materials only', 'pencil|paper|crayons|desk'),
('required', 'All materials on worksheet', 'included|provided|on\s+this\s+page');

-- Indexes for performance
CREATE INDEX idx_performance_metrics_student ON student_performance_metrics(student_id);
CREATE INDEX idx_adjustment_queue_student ON lesson_adjustment_queue(student_id, processed);
CREATE INDEX idx_adjustment_queue_priority ON lesson_adjustment_queue(priority DESC, created_at DESC);
CREATE INDEX idx_differentiated_lessons_students ON differentiated_lessons USING GIN(student_ids);
CREATE INDEX idx_lesson_performance_student ON lesson_performance_history(student_id);

-- Add comments for documentation
COMMENT ON TABLE assessment_types IS 'Registry of assessment types with AI interpretation rules';
COMMENT ON TABLE student_performance_metrics IS 'Aggregated performance data per student per subject';
COMMENT ON TABLE lesson_adjustment_queue IS 'Queue of pending lesson adjustments based on performance';
COMMENT ON TABLE differentiated_lessons IS 'Generated lessons with differentiation data';
COMMENT ON TABLE material_constraints IS 'Rules to ensure zero-prep materials';
COMMENT ON TABLE lesson_performance_history IS 'Historical data on lesson effectiveness';