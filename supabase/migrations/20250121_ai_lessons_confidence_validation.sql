-- Add validation constraints for confidence fields

-- Add constraint for assessment_types.confidence_weight to ensure values between 0 and 1
ALTER TABLE assessment_types
  ADD CONSTRAINT assessment_types_confidence_weight_check
  CHECK (confidence_weight BETWEEN 0 AND 1);

-- Add constraint for student_performance_metrics.confidence_score to ensure values between 0 and 1
ALTER TABLE student_performance_metrics
  ADD CONSTRAINT student_performance_metrics_confidence_score_check
  CHECK (confidence_score BETWEEN 0 AND 1);

-- Add constraint for differentiated_lessons.data_confidence to ensure values between 0 and 1
ALTER TABLE differentiated_lessons
  ADD CONSTRAINT differentiated_lessons_data_confidence_check
  CHECK (data_confidence BETWEEN 0 AND 1);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to automatically update updated_at column
CREATE TRIGGER assessment_types_updated_at
  BEFORE UPDATE ON assessment_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER student_performance_metrics_updated_at
  BEFORE UPDATE ON student_performance_metrics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER lesson_adjustment_queue_updated_at
  BEFORE UPDATE ON lesson_adjustment_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER differentiated_lessons_updated_at
  BEFORE UPDATE ON differentiated_lessons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER material_constraints_updated_at
  BEFORE UPDATE ON material_constraints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER lesson_performance_history_updated_at
  BEFORE UPDATE ON lesson_performance_history
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();