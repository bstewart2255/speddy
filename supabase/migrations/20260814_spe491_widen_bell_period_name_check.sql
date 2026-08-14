-- SPE-491: bell_schedules_period_name_check predates secondary period grids —
-- it allow-listed only the elementary block names, so every row the secondary
-- picklist offers (Period A/1-8, Advisory, Brunch, Passing) was refused at
-- the database while the form offered it (found by the sim walk; same class
-- of bug as SPE-343). Widen to the union of both picklists. Strictly
-- additive: every previously-legal value stays legal, so no existing row can
-- violate the new constraint.

ALTER TABLE public.bell_schedules
  DROP CONSTRAINT bell_schedules_period_name_check;

ALTER TABLE public.bell_schedules
  ADD CONSTRAINT bell_schedules_period_name_check CHECK (
    period_name IS NULL OR period_name = ANY (ARRAY[
      -- Elementary blocks (BELL_SCHEDULE_ACTIVITIES + legacy daily markers)
      'Recess'::text, 'Lunch'::text, 'Lunch Recess'::text, 'Snack'::text,
      'PE'::text, 'School Start'::text, 'Dismissal'::text, 'Early Dismissal'::text,
      -- Secondary period grid (SECONDARY_BELL_SCHEDULE_ACTIVITIES, SPE-491)
      'Period A'::text, 'Period 1'::text, 'Period 2'::text, 'Period 3'::text,
      'Period 4'::text, 'Period 5'::text, 'Period 6'::text, 'Period 7'::text,
      'Period 8'::text, 'Advisory'::text, 'Brunch'::text, 'Passing'::text
    ])
  );
