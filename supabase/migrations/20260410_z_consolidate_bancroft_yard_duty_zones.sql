-- Consolidate manually-entered yard duty zone names for Bancroft Elementary
-- and populate the yard_duty_zones settings table with the canonical zone list.

-- Step 1: Consolidate zone names on existing assignments

-- Basketball variants -> "Basketball & Blacktop"
UPDATE yard_duty_assignments
SET zone_name = 'Basketball & Blacktop'
WHERE school_id = '062271002457'
  AND zone_name IN ('Basketball', 'Basketball & Back Blacktop', 'Basketball & Blacktop Area');

-- "Swings, Bikes, Grass Area" -> "Swings, Bikes & Grass Area"
UPDATE yard_duty_assignments
SET zone_name = 'Swings, Bikes & Grass Area'
WHERE school_id = '062271002457'
  AND zone_name = 'Swings, Bikes, Grass Area';

-- "Yard Duty" -> NULL (generic label, not a real zone)
UPDATE yard_duty_assignments
SET zone_name = NULL
WHERE school_id = '062271002457'
  AND zone_name = 'Yard Duty';

-- Step 2: Replace all existing Bancroft zones with the 8 canonical zones
DELETE FROM yard_duty_zones
WHERE school_id = '062271002457';

INSERT INTO yard_duty_zones (school_id, zone_name)
VALUES
  ('062271002457', 'Basketball & Blacktop'),
  ('062271002457', 'Car Lane'),
  ('062271002457', 'Handball & Restrooms'),
  ('062271002457', 'Kinder Transition'),
  ('062271002457', 'Kinder Yard'),
  ('062271002457', 'Playstructure & Balls'),
  ('062271002457', 'Playstructure & Swings'),
  ('062271002457', 'Swings, Bikes & Grass Area');
