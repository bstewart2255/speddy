-- ============================================================================
-- MIGRATION TEST SCRIPT
-- Purpose: Verify migration will work correctly before applying
-- ============================================================================

-- Test 1: Check current state
SELECT 
    'Current State Check' as test_name,
    'lessons' as table_name, 
    COUNT(*) as record_count,
    COUNT(CASE WHEN content_old_text IS NOT NULL AND content IS NULL THEN 1 END) as html_only,
    COUNT(CASE WHEN content IS NOT NULL THEN 1 END) as json_content
FROM lessons

UNION ALL

SELECT 
    'Current State Check',
    'ai_generated_lessons', 
    COUNT(*),
    0,
    0
FROM ai_generated_lessons

UNION ALL

SELECT 
    'Current State Check',
    'manual_lesson_plans', 
    COUNT(*),
    0,
    0
FROM manual_lesson_plans;

-- Test 2: Check for potential conflicts
WITH potential_conflicts AS (
    SELECT 
        agl.provider_id,
        agl.school_id,
        agl.lesson_date,
        agl.time_slot,
        COUNT(*) as conflict_count
    FROM ai_generated_lessons agl
    GROUP BY agl.provider_id, agl.school_id, agl.lesson_date, agl.time_slot
    HAVING COUNT(*) > 1
)
SELECT 
    'Conflict Check' as test_name,
    COUNT(*) as conflicts_found,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS - No conflicts'
        ELSE 'FAIL - Conflicts exist'
    END as result
FROM potential_conflicts;

-- Test 3: Check school_id mapping capability
WITH school_mapping AS (
    SELECT 
        l.school_site,
        s.id as mapped_school_id,
        COUNT(*) as lesson_count
    FROM lessons l
    LEFT JOIN schools s ON LOWER(s.name) = LOWER(l.school_site)
    WHERE l.school_site IS NOT NULL
    GROUP BY l.school_site, s.id
)
SELECT 
    'School Mapping Test' as test_name,
    COUNT(*) as total_schools,
    COUNT(CASE WHEN mapped_school_id IS NOT NULL THEN 1 END) as mapped_schools,
    COUNT(CASE WHEN mapped_school_id IS NULL THEN 1 END) as unmapped_schools,
    CASE 
        WHEN COUNT(CASE WHEN mapped_school_id IS NULL THEN 1 END) = 0 THEN 'PASS - All schools mapped'
        ELSE 'WARNING - Some schools not mapped'
    END as result
FROM school_mapping;

-- Test 4: Check for NULL provider_ids (would violate NOT NULL constraint)
SELECT 
    'NULL Provider Check' as test_name,
    'lessons' as table_name,
    COUNT(*) as null_provider_count
FROM lessons
WHERE provider_id IS NULL

UNION ALL

SELECT 
    'NULL Provider Check',
    'ai_generated_lessons',
    COUNT(*)
FROM ai_generated_lessons  
WHERE provider_id IS NULL

UNION ALL

SELECT 
    'NULL Provider Check',
    'manual_lesson_plans',
    COUNT(*)
FROM manual_lesson_plans
WHERE provider_id IS NULL;

-- Test 5: Validate foreign key references
WITH fk_check AS (
    SELECT 
        'lessons.provider_id' as reference,
        COUNT(*) as total_records,
        COUNT(CASE WHEN p.id IS NULL THEN 1 END) as invalid_refs
    FROM lessons l
    LEFT JOIN profiles p ON l.provider_id = p.id
    
    UNION ALL
    
    SELECT 
        'ai_generated_lessons.provider_id',
        COUNT(*),
        COUNT(CASE WHEN p.id IS NULL THEN 1 END)
    FROM ai_generated_lessons agl
    LEFT JOIN profiles p ON agl.provider_id = p.id
    
    UNION ALL
    
    SELECT 
        'manual_lesson_plans.provider_id',
        COUNT(*),
        COUNT(CASE WHEN p.id IS NULL THEN 1 END)
    FROM manual_lesson_plans mlp
    LEFT JOIN profiles p ON mlp.provider_id = p.id
)
SELECT 
    'Foreign Key Check' as test_name,
    reference,
    total_records,
    invalid_refs,
    CASE 
        WHEN invalid_refs = 0 THEN 'PASS'
        ELSE 'FAIL - Invalid references exist'
    END as result
FROM fk_check;

-- Test 6: Estimate migrated data structure
SELECT 
    'Migration Preview' as test_name,
    'lessons_old -> lessons' as migration_path,
    COUNT(*) as records,
    COUNT(CASE 
        WHEN content_old_text IS NOT NULL AND content IS NULL THEN 1 
    END) as will_be_legacy_html,
    COUNT(CASE 
        WHEN lesson_type = 'ai' OR ai_raw_response IS NOT NULL THEN 1 
    END) as will_be_ai_generated,
    COUNT(CASE 
        WHEN lesson_type != 'ai' AND ai_raw_response IS NULL AND content IS NOT NULL THEN 1 
    END) as will_be_manual
FROM lessons;

-- Test 7: Check for duplicate IDs across tables
WITH all_ids AS (
    SELECT id, 'lessons' as source FROM lessons
    UNION ALL
    SELECT id, 'ai_generated_lessons' FROM ai_generated_lessons
    UNION ALL
    SELECT id, 'manual_lesson_plans' FROM manual_lesson_plans
),
duplicate_ids AS (
    SELECT id, COUNT(*) as count, STRING_AGG(source, ', ') as sources
    FROM all_ids
    GROUP BY id
    HAVING COUNT(*) > 1
)
SELECT 
    'Duplicate ID Check' as test_name,
    COUNT(*) as duplicate_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS - No duplicate IDs'
        ELSE 'FAIL - Duplicate IDs found: ' || COUNT(*)::text
    END as result
FROM duplicate_ids;

-- Test 8: Summary Report
SELECT 
    'MIGRATION READINESS SUMMARY' as report,
    'Total Records to Migrate' as metric,
    (SELECT COUNT(*) FROM lessons) + 
    (SELECT COUNT(*) FROM ai_generated_lessons) + 
    (SELECT COUNT(*) FROM manual_lesson_plans) as value;