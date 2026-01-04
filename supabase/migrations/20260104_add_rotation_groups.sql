-- Feature 3: Rotation Groups & Weekly Calendar
-- Allows site admins to create teacher groups that rotate between two activities

-- School year configuration (one per school, reused across groups)
CREATE TABLE public.school_year_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id),
  CHECK (end_date > start_date)
);

-- Rotation pairing between two activities (e.g., STEAM + Garden)
CREATE TABLE public.rotation_activity_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  activity_type_a TEXT NOT NULL,
  activity_type_b TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, activity_type_a, activity_type_b),
  CHECK (activity_type_a <> activity_type_b)
);

-- Groups within a rotation pair (always 2: Group A and Group B)
CREATE TABLE public.rotation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES public.rotation_activity_pairs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Teachers in a group with their scheduled time slots
CREATE TABLE public.rotation_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.rotation_groups(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, teacher_id),
  CHECK (end_time > start_time)
);

-- Weekly assignments (which group has which activity each week)
CREATE TABLE public.rotation_week_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES public.rotation_activity_pairs(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  group_id UUID NOT NULL REFERENCES public.rotation_groups(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(pair_id, week_start_date, group_id)
);

-- Indexes for performance
CREATE INDEX idx_school_year_config_school ON public.school_year_config(school_id);
CREATE INDEX idx_rotation_pairs_school ON public.rotation_activity_pairs(school_id);
CREATE INDEX idx_rotation_groups_pair ON public.rotation_groups(pair_id);
CREATE INDEX idx_rotation_members_group ON public.rotation_group_members(group_id);
CREATE INDEX idx_rotation_members_teacher ON public.rotation_group_members(teacher_id);
CREATE INDEX idx_rotation_week_pair ON public.rotation_week_assignments(pair_id);
CREATE INDEX idx_rotation_week_date ON public.rotation_week_assignments(week_start_date);

-- Enable RLS on all tables
ALTER TABLE public.school_year_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_activity_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_week_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for school_year_config
CREATE POLICY "Site admins can view their school year config"
  ON public.school_year_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = school_year_config.school_id
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can insert school year config"
  ON public.school_year_config
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = school_year_config.school_id
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can update their school year config"
  ON public.school_year_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = school_year_config.school_id
      AND ap.role = 'site_admin'
    )
  );

-- RLS Policies for rotation_activity_pairs
CREATE POLICY "Site admins can view their rotation pairs"
  ON public.rotation_activity_pairs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = rotation_activity_pairs.school_id
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can insert rotation pairs"
  ON public.rotation_activity_pairs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = rotation_activity_pairs.school_id
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can update their rotation pairs"
  ON public.rotation_activity_pairs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = rotation_activity_pairs.school_id
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can delete their rotation pairs"
  ON public.rotation_activity_pairs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = rotation_activity_pairs.school_id
      AND ap.role = 'site_admin'
    )
  );

-- RLS Policies for rotation_groups (access via pair's school_id)
CREATE POLICY "Site admins can view their rotation groups"
  ON public.rotation_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_activity_pairs rap
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rap.id = rotation_groups.pair_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can insert rotation groups"
  ON public.rotation_groups
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rotation_activity_pairs rap
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rap.id = rotation_groups.pair_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can update their rotation groups"
  ON public.rotation_groups
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_activity_pairs rap
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rap.id = rotation_groups.pair_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can delete their rotation groups"
  ON public.rotation_groups
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_activity_pairs rap
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rap.id = rotation_groups.pair_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

-- RLS Policies for rotation_group_members (access via group -> pair -> school)
CREATE POLICY "Site admins can view their rotation group members"
  ON public.rotation_group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_groups rg
      JOIN public.rotation_activity_pairs rap ON rap.id = rg.pair_id
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rg.id = rotation_group_members.group_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can insert rotation group members"
  ON public.rotation_group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rotation_groups rg
      JOIN public.rotation_activity_pairs rap ON rap.id = rg.pair_id
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rg.id = rotation_group_members.group_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can update their rotation group members"
  ON public.rotation_group_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_groups rg
      JOIN public.rotation_activity_pairs rap ON rap.id = rg.pair_id
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rg.id = rotation_group_members.group_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can delete their rotation group members"
  ON public.rotation_group_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_groups rg
      JOIN public.rotation_activity_pairs rap ON rap.id = rg.pair_id
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rg.id = rotation_group_members.group_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

-- RLS Policies for rotation_week_assignments (access via pair -> school)
CREATE POLICY "Site admins can view their rotation week assignments"
  ON public.rotation_week_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_activity_pairs rap
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rap.id = rotation_week_assignments.pair_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can insert rotation week assignments"
  ON public.rotation_week_assignments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rotation_activity_pairs rap
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rap.id = rotation_week_assignments.pair_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can update their rotation week assignments"
  ON public.rotation_week_assignments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_activity_pairs rap
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rap.id = rotation_week_assignments.pair_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can delete their rotation week assignments"
  ON public.rotation_week_assignments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_activity_pairs rap
      JOIN public.admin_permissions ap ON ap.school_id = rap.school_id
      WHERE rap.id = rotation_week_assignments.pair_id
      AND ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
    )
  );
