-- Load Rodeo Hills Elementary's bell schedule for 2026-2027 (SPE-462).
--
-- Source: the school's official "2025-2026 Bell Schedule" PDF (English and
-- Spanish pages cross-checked against each other; they agree). Loaded as
-- 2026-2027 per product decision -- 2025-2026 has ended and no read path in the
-- app can reach a past year, so loading it there would make it invisible.
-- Times are assumed unchanged year over year; the school should confirm.
--
-- 177 rows: 7 grades (TK-5) x 5 days.
--   Regular day (Mon/Tue/Thu/Fri): 39 blocks x 4 = 156
--   Adjusted day (Wed):            21 blocks x 1 = 21
--
-- TK and K run two staggered cohorts, and the bell schedule cannot express that:
--
--   Early Friends  8:40 - 1:10
--   Late Friends  10:25 - 2:55
--
-- Both dismissals are carried (Early Dismissal 1:10, Dismissal 2:55), and both
-- recesses (morning 10:10-10:25 belongs to the early group, who are the only
-- ones on site; afternoon 1:55-2:10 to the late group, the early group having
-- gone home). Blocking fifteen minutes too much beats booking a student who
-- is not there.
--
-- KNOWN LIMITATION: the single 'School Start' 8:40 row for TK/K is the EARLY
-- cohort's start. Late Friends do not arrive until 10:25, and there is no
-- period type for a second start time, so nothing here says so. A provider
-- reading the grid could schedule a Late Friend at 9:00, when that child is
-- not yet at school. Tracked on SPE-462 — needs a product decision on how to
-- represent a staggered cohort, since one grade with two day-lengths is not
-- something bell_schedules models.
--
-- Note also that the source PDF carries an early-year variant ("8:40-12:15"
-- and "11:20-2:55" until 9/19/2025). The 2026-2027 equivalent is unknown and
-- is not represented here.
--
-- Attributed to the school's own site admin (matching how Bancroft's schedule
-- was loaded), so she can edit these through the app.
--
-- Known gap to raise with the school: the PDF assigns lunches to named teachers
-- ("5th Grade, Byrnes"; "TK & 1st grade, Eaton, Domich, Espiritu"). Speddy
-- blocks time by grade, not by class, so if those teachers' students eat at a
-- different time than their grade does, these blocks will be wrong for them.

BEGIN;

-- Refuse to double-load. Makes this safe to replay, and catches the case where
-- the school has since entered their own schedule through the app.
DO $$
DECLARE
  existing bigint;
BEGIN
  SELECT count(*) INTO existing
  FROM bell_schedules
  WHERE school_id = '061899002301' AND school_year = '2026-2027';

  IF existing > 0 THEN
    RAISE EXCEPTION 'SPE-462: Rodeo Hills already has % bell schedule rows for 2026-2027; refusing to load on top', existing;
  END IF;
END $$;

-- Regular days: Monday, Tuesday, Thursday, Friday (39 blocks x 4 days = 156 rows)
INSERT INTO bell_schedules
  (school_id, school_year, grade_level, day_of_week, start_time, end_time,
   period_name, provider_id, created_by_id, created_by_role)
SELECT '061899002301', '2026-2027', b.grade, d.day,
       b.start_time::time, b.end_time::time,
       b.period_name, NULL, '8af90779-42c3-44b7-9fe2-694dbdc18d7f', 'site_admin'
FROM (VALUES
    ('TK', 'School Start', '08:40:00', '08:41:00'),  -- School begins every day for all grades at 8:40
    ('TK', 'Recess', '10:10:00', '10:25:00'),  -- TK/K Morning Recess
    ('TK', 'Lunch', '11:25:00', '11:50:00'),  -- TK & 1st grade lunch
    ('TK', 'Lunch Recess', '11:50:00', '12:15:00'),  -- TK & 1st grade lunch recess
    ('TK', 'Early Dismissal', '13:10:00', '13:11:00'),  -- TK/K 'Early Friends' dismissal 1:10
    ('TK', 'Recess', '13:55:00', '14:10:00'),  -- TK/K Afternoon Recess (1:55-2:10)
    ('TK', 'Dismissal', '14:55:00', '14:56:00'),  -- TK/K 'Late Friends' dismissal 2:55
    ('K', 'School Start', '08:40:00', '08:41:00'),  -- School begins every day for all grades at 8:40
    ('K', 'Recess', '10:10:00', '10:25:00'),  -- TK/K Morning Recess
    ('K', 'Lunch Recess', '11:25:00', '11:50:00'),  -- Kindergarten recess FIRST, then lunch
    ('K', 'Lunch', '11:50:00', '12:15:00'),  -- Kindergarten lunch
    ('K', 'Early Dismissal', '13:10:00', '13:11:00'),  -- TK/K 'Early Friends' dismissal 1:10
    ('K', 'Recess', '13:55:00', '14:10:00'),  -- TK/K Afternoon Recess (1:55-2:10)
    ('K', 'Dismissal', '14:55:00', '14:56:00'),  -- TK/K 'Late Friends' dismissal 2:55
    ('1', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('1', 'Recess', '09:50:00', '10:05:00'),  -- 1st grade recess
    ('1', 'Lunch', '11:25:00', '11:50:00'),  -- TK & 1st grade lunch
    ('1', 'Lunch Recess', '11:50:00', '12:15:00'),  -- TK & 1st grade lunch recess
    ('1', 'Dismissal', '14:55:00', '14:56:00'),  -- Dismissal 1st through 3rd - 2:55
    ('2', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('2', 'Recess', '10:15:00', '10:30:00'),  -- 2nd grade recess
    ('2', 'Lunch', '11:50:00', '12:15:00'),  -- 2nd grade lunch
    ('2', 'Lunch Recess', '12:15:00', '12:40:00'),  -- 2nd grade lunch recess
    ('2', 'Dismissal', '14:55:00', '14:56:00'),  -- Dismissal 1st through 3rd - 2:55
    ('3', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('3', 'Recess', '10:30:00', '10:45:00'),  -- 3rd grade recess
    ('3', 'Lunch', '12:20:00', '12:45:00'),  -- 3rd grade lunch
    ('3', 'Lunch Recess', '12:45:00', '13:10:00'),  -- 3rd grade lunch recess (12:45-1:10)
    ('3', 'Dismissal', '14:55:00', '14:56:00'),  -- Dismissal 1st through 3rd - 2:55
    ('4', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('4', 'Recess', '10:45:00', '11:00:00'),  -- 4th grade recess
    ('4', 'Lunch', '12:50:00', '13:10:00'),  -- 4th grade lunch (12:50-1:10)
    ('4', 'Lunch Recess', '13:10:00', '13:26:00'),  -- 4th grade lunch recess (1:10-1:26)
    ('4', 'Dismissal', '15:00:00', '15:01:00'),  -- Dismissal 4th & 5th - 3:00
    ('5', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('5', 'Lunch', '11:00:00', '11:20:00'),  -- 5th Grade, Byrnes lunch
    ('5', 'Lunch Recess', '11:20:00', '11:36:00'),  -- 5th Grade, Byrnes lunch recess
    ('5', 'Recess', '13:30:00', '13:45:00'),  -- 5th grade recess (1:30-1:45, afternoon)
    ('5', 'Dismissal', '15:00:00', '15:01:00')  -- Dismissal 4th & 5th - 3:00
) AS b(grade, period_name, start_time, end_time)
CROSS JOIN (VALUES (1), (2), (4), (5)) AS d(day);

-- Adjusted day: Wednesday (21 blocks x 1 day = 21 rows)
INSERT INTO bell_schedules
  (school_id, school_year, grade_level, day_of_week, start_time, end_time,
   period_name, provider_id, created_by_id, created_by_role)
SELECT '061899002301', '2026-2027', b.grade, d.day,
       b.start_time::time, b.end_time::time,
       b.period_name, NULL, '8af90779-42c3-44b7-9fe2-694dbdc18d7f', 'site_admin'
FROM (VALUES
    ('TK', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('TK', 'Lunch', '10:50:00', '11:10:00'),  -- TK, 1st grade lunch
    ('TK', 'Early Dismissal', '12:40:00', '12:41:00'),  -- Dismissal TK through 3rd - 12:40
    ('K', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('K', 'Lunch', '11:15:00', '11:35:00'),  -- Kindergarten & 2nd grade lunch
    ('K', 'Early Dismissal', '12:40:00', '12:41:00'),  -- All K & TK on Adjusted Days: 8:40-12:40
    ('1', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('1', 'Lunch', '10:50:00', '11:10:00'),  -- TK, 1st grade lunch
    ('1', 'Early Dismissal', '12:40:00', '12:41:00'),  -- Dismissal TK through 3rd - 12:40
    ('2', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('2', 'Lunch', '11:15:00', '11:35:00'),  -- Kindergarten & 2nd grade lunch
    ('2', 'Early Dismissal', '12:40:00', '12:41:00'),  -- Dismissal TK through 3rd - 12:40
    ('3', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('3', 'Lunch', '11:40:00', '12:00:00'),  -- 3rd & 4th grade lunch
    ('3', 'Early Dismissal', '12:40:00', '12:41:00'),  -- Dismissal TK through 3rd - 12:40
    ('4', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('4', 'Lunch', '11:40:00', '12:00:00'),  -- 3rd & 4th grade lunch
    ('4', 'Early Dismissal', '12:45:00', '12:46:00'),  -- Dismissal 4th & 5th - 12:45
    ('5', 'School Start', '08:40:00', '08:41:00'),  -- Start Time 8:40
    ('5', 'Lunch', '12:05:00', '12:25:00'),  -- 5th grade lunch
    ('5', 'Early Dismissal', '12:45:00', '12:46:00')  -- Dismissal 4th & 5th - 12:45
) AS b(grade, period_name, start_time, end_time)
CROSS JOIN (VALUES (3)) AS d(day);

-- Guard: exactly the expected row count landed.
DO $$
DECLARE
  loaded bigint;
BEGIN
  SELECT count(*) INTO loaded
  FROM bell_schedules
  WHERE school_id = '061899002301' AND school_year = '2026-2027';

  IF loaded <> 177 THEN
    RAISE EXCEPTION 'SPE-462: expected 177 rows for Rodeo Hills, found %', loaded;
  END IF;
END $$;

COMMIT;
