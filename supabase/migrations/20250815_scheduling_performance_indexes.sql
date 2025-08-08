-- Performance indexes for optimized scheduling queries
-- These indexes support batch data fetching in OptimizedScheduler to fix N+1 query issues

-- Index for schedule_sessions: provider and day lookup
CREATE INDEX IF NOT EXISTS idx_sessions_provider_day 
ON schedule_sessions(provider_id, day_of_week);

-- Index for bell_schedules: provider and day lookup
CREATE INDEX IF NOT EXISTS idx_bell_schedules_provider_day 
ON bell_schedules(provider_id, day_of_week);

-- Index for special_activities: provider and day lookup
CREATE INDEX IF NOT EXISTS idx_special_activities_provider_day 
ON special_activities(provider_id, day_of_week);

-- Index for user_site_schedules: user and day lookup
CREATE INDEX IF NOT EXISTS idx_user_site_schedules_user_day 
ON user_site_schedules(user_id, day_of_week);

-- Composite index for schedule_sessions with school site filtering
CREATE INDEX IF NOT EXISTS idx_sessions_provider_school 
ON schedule_sessions(provider_id, student_id);

-- Index for school_hours: provider, school, and day lookup
CREATE INDEX IF NOT EXISTS idx_school_hours_provider_school_day 
ON school_hours(provider_id, school_site, day_of_week);

-- Index for provider_schools: efficient school-provider mapping
CREATE INDEX IF NOT EXISTS idx_provider_schools_provider_school 
ON provider_schools(provider_id, school_site);

-- Index for students to support joins in scheduling queries
CREATE INDEX IF NOT EXISTS idx_students_school_site 
ON students(school_site);

-- Index for schedule_sessions start/end times for overlap checking
CREATE INDEX IF NOT EXISTS idx_sessions_times 
ON schedule_sessions(day_of_week, start_time, end_time);

-- Composite index for efficient bell schedule lookups by grade
CREATE INDEX IF NOT EXISTS idx_bell_schedules_grade 
ON bell_schedules(school_site, grade_level, day_of_week);

-- Composite index for efficient special activities lookups by teacher
CREATE INDEX IF NOT EXISTS idx_special_activities_teacher 
ON special_activities(school_site, teacher_name, day_of_week);