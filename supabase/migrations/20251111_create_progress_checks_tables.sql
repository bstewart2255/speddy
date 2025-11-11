-- Create progress_checks table to store generated assessments
CREATE TABLE IF NOT EXISTS progress_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  school_id VARCHAR REFERENCES schools(id) ON DELETE CASCADE,
  district_id VARCHAR REFERENCES districts(id) ON DELETE CASCADE,
  state_id VARCHAR REFERENCES states(id) ON DELETE CASCADE
);

-- Create progress_check_results table to store per-question grading
CREATE TABLE IF NOT EXISTS progress_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_check_id UUID NOT NULL REFERENCES progress_checks(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  iep_goal_index INTEGER NOT NULL,
  question_index INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('correct', 'incorrect', 'excluded')),
  notes TEXT,
  graded_by UUID NOT NULL REFERENCES auth.users(id),
  graded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(progress_check_id, iep_goal_index, question_index)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_progress_checks_student_id ON progress_checks(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_checks_provider_id ON progress_checks(provider_id);
CREATE INDEX IF NOT EXISTS idx_progress_checks_created_at ON progress_checks(created_at);
CREATE INDEX IF NOT EXISTS idx_progress_check_results_check_id ON progress_check_results(progress_check_id);
CREATE INDEX IF NOT EXISTS idx_progress_check_results_student_id ON progress_check_results(student_id);

-- Enable RLS
ALTER TABLE progress_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_check_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for progress_checks
CREATE POLICY "Users can view their own progress checks"
  ON progress_checks FOR SELECT
  USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own progress checks"
  ON progress_checks FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own progress checks"
  ON progress_checks FOR UPDATE
  USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own progress checks"
  ON progress_checks FOR DELETE
  USING (auth.uid() = provider_id);

-- RLS Policies for progress_check_results
CREATE POLICY "Users can view results for their progress checks"
  ON progress_check_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM progress_checks
      WHERE progress_checks.id = progress_check_results.progress_check_id
      AND progress_checks.provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert results for their progress checks"
  ON progress_check_results FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM progress_checks
      WHERE progress_checks.id = progress_check_results.progress_check_id
      AND progress_checks.provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can update results for their progress checks"
  ON progress_check_results FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM progress_checks
      WHERE progress_checks.id = progress_check_results.progress_check_id
      AND progress_checks.provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete results for their progress checks"
  ON progress_check_results FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM progress_checks
      WHERE progress_checks.id = progress_check_results.progress_check_id
      AND progress_checks.provider_id = auth.uid()
    )
  );
