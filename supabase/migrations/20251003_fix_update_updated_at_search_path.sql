-- Fix update_updated_at function search_path security warning
-- This prevents potential security issues from search path manipulation

-- Drop and recreate function with proper search_path setting
DROP FUNCTION IF EXISTS public.update_updated_at CASCADE;
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate any triggers that were dropped by CASCADE
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find all tables that might have been using this trigger
    -- and recreate the trigger if it doesn't exist
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN (
            SELECT DISTINCT tablename
            FROM pg_tables t
            WHERE EXISTS (
                SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                AND c.table_name = t.tablename
                AND c.column_name = 'updated_at'
            )
        )
    LOOP
        -- Check if a trigger using update_updated_at exists
        IF EXISTS (
            SELECT 1
            FROM information_schema.triggers
            WHERE event_object_schema = 'public'
            AND event_object_table = r.tablename
            AND action_statement LIKE '%update_updated_at%'
        ) AND NOT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgname = 'update_' || r.tablename || '_updated_at'
            AND tgrelid = ('public.' || r.tablename)::regclass
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER update_%I_updated_at
                BEFORE UPDATE ON public.%I
                FOR EACH ROW
                EXECUTE FUNCTION public.update_updated_at()',
                r.tablename, r.tablename
            );
        END IF;
    END LOOP;
END
$$;
