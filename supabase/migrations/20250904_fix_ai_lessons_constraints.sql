-- Fix the constraint issue on ai_generated_lessons table
-- The old unique constraint is preventing inserts because it doesn't include school_id

-- Drop the old constraint that doesn't include school_id
ALTER TABLE ai_generated_lessons
DROP CONSTRAINT IF EXISTS unique_lesson_per_time_slot;

-- Also drop any other old constraint variants that might exist
ALTER TABLE ai_generated_lessons
DROP CONSTRAINT IF EXISTS ai_generated_lessons_provider_id_lesson_date_time_slot_key;

-- Verify our new constraint exists (it should from the previous migration)
-- If not, recreate it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'ai_generated_lessons_unique_lesson'
    ) THEN
        ALTER TABLE ai_generated_lessons
        ADD CONSTRAINT ai_generated_lessons_unique_lesson
        UNIQUE (provider_id, school_id, lesson_date, time_slot);
    END IF;
END $$;

-- Log what constraints remain for verification
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    RAISE NOTICE 'Current unique constraints on ai_generated_lessons:';
    FOR constraint_record IN 
        SELECT conname, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'ai_generated_lessons'::regclass
        AND contype = 'u'
    LOOP
        RAISE NOTICE '  - %: %', constraint_record.conname, constraint_record.definition;
    END LOOP;
END $$;