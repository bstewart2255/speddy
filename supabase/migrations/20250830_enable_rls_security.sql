-- Enable RLS on all public tables that need it
ALTER TABLE public.assessment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_adjustment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.differentiated_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_performance_history ENABLE ROW LEVEL SECURITY;

-- Create policies for assessment_types (read-only for authenticated users)
CREATE POLICY "Allow authenticated users to read assessment_types" 
ON public.assessment_types 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow service role full access to assessment_types" 
ON public.assessment_types 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Create policies for student_performance_metrics (authenticated users can manage)
CREATE POLICY "Allow authenticated users to read student_performance_metrics" 
ON public.student_performance_metrics 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated users to insert student_performance_metrics" 
ON public.student_performance_metrics 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update student_performance_metrics" 
ON public.student_performance_metrics 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow service role full access to student_performance_metrics" 
ON public.student_performance_metrics 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Create policies for lesson_adjustment_queue (authenticated users can manage)
CREATE POLICY "Allow authenticated users to read lesson_adjustment_queue" 
ON public.lesson_adjustment_queue 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated users to insert lesson_adjustment_queue" 
ON public.lesson_adjustment_queue 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update lesson_adjustment_queue" 
ON public.lesson_adjustment_queue 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow service role full access to lesson_adjustment_queue" 
ON public.lesson_adjustment_queue 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Create policies for differentiated_lessons (authenticated users can manage)
CREATE POLICY "Allow authenticated users to read differentiated_lessons" 
ON public.differentiated_lessons 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated users to insert differentiated_lessons" 
ON public.differentiated_lessons 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update differentiated_lessons" 
ON public.differentiated_lessons 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete differentiated_lessons" 
ON public.differentiated_lessons 
FOR DELETE 
TO authenticated 
USING (true);

CREATE POLICY "Allow service role full access to differentiated_lessons" 
ON public.differentiated_lessons 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Create policies for material_constraints (read-only for authenticated users)
CREATE POLICY "Allow authenticated users to read material_constraints" 
ON public.material_constraints 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow service role full access to material_constraints" 
ON public.material_constraints 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Create policies for lesson_performance_history (authenticated users can manage)
CREATE POLICY "Allow authenticated users to read lesson_performance_history" 
ON public.lesson_performance_history 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated users to insert lesson_performance_history" 
ON public.lesson_performance_history 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update lesson_performance_history" 
ON public.lesson_performance_history 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow service role full access to lesson_performance_history" 
ON public.lesson_performance_history 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);