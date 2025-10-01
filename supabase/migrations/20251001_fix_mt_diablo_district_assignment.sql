-- Fix Mt. Diablo Unified schools that were incorrectly assigned to Orange County Department of Education
-- Issue: Schools in Mt. Diablo Unified (district_id: 0761754) were incorrectly assigned to
-- Orange County Department of Education (district_id: 0622710) during CA schools import
-- This caused the Team widget to show "Orange County Department of Education" for Mt. Diablo schools

-- Update schools table to correct district assignment
UPDATE schools
SET district_id = '0761754'
WHERE id IN (
  '062271002456',  -- Pleasant Hill Elementary
  '062271002457',  -- Bancroft Elementary School
  '062271002458',  -- Mt Diablo Elementary
  '062271002459',  -- Fair Oaks Elementary
  '062271002460',  -- Valle Verde Elementary School
  '062271002461',  -- Valhalla Elementary School
  '062271002462'   -- Walnut Acres Elementary
)
AND district_id = '0622710';

-- Update profiles to have the correct district_id
UPDATE profiles
SET district_id = '0761754'
WHERE school_id IN (
  '062271002456',
  '062271002457',
  '062271002458',
  '062271002459',
  '062271002460',
  '062271002461',
  '062271002462'
)
AND district_id = '0622710';

-- Also update provider_schools if any exist
UPDATE provider_schools
SET district_id = '0761754'
WHERE school_id IN (
  '062271002456',
  '062271002457',
  '062271002458',
  '062271002459',
  '062271002460',
  '062271002461',
  '062271002462'
)
AND district_id = '0622710';
