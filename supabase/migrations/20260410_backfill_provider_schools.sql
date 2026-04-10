-- Backfill missing provider_schools entries for legacy providers at Bancroft Elementary.
-- These providers were created before provider_schools was introduced.
INSERT INTO provider_schools (provider_id, school_id, school_site, school_district, is_primary, district_id, state_id)
SELECT
  p.id,
  p.school_id,
  s.name,
  '',
  true,
  p.district_id,
  p.state_id
FROM profiles p
JOIN schools s ON s.id = p.school_id
WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist', 'sea', 'psychologist', 'intervention')
  AND NOT EXISTS (
    SELECT 1 FROM provider_schools ps
    WHERE ps.provider_id = p.id AND ps.school_id = p.school_id
  );
