-- Add teacher_id foreign key to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES teachers(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_students_teacher_id ON students(teacher_id);