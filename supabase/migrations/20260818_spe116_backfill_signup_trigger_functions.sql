-- SPE-116: Backfill the two live signup trigger functions so the repo
-- reproduces them.
--
-- `handle_new_user()` and `handle_new_user_schools()` exist in production and
-- fire on every auth.users INSERT, but neither has a CREATE anywhere in
-- supabase/migrations. They were created outside the migration history
-- (dashboard or a lost migration), so a database built only from this directory
-- would not have them, and signup would silently not create a profile or a
-- provider_schools row.
--
-- Both bodies below are reproduced from the live definitions
-- (pg_get_functiondef, 2026-08-18), verified token-for-token: with all runs of
-- whitespace collapsed, each body hashes identically to prod's `prosrc`
--
--     handle_new_user          md5 f1e594aeded75774c726eec917700470  (2134 chars)
--     handle_new_user_schools  md5 efbe7a7b00e6b099ac76e6873b96a765  (3421 chars)
--
-- The only difference is that trailing spaces on otherwise-blank lines have
-- been dropped, which PL/pgSQL does not distinguish. So applying this is a
-- behavioural no-op — CREATE OR REPLACE rewrites each function with the logic
-- it already has. Nothing about signup changes here; capturing is the whole
-- point. See "What this does NOT fix" below.
--
-- `npm run db:drift` re-checks this against the database at any time.
--
-- ## Deliberately NOT applied to production
--
-- This file was not run against prod, and does not need to be. Prod already has
-- both functions with exactly this logic — that is what the hashes above
-- establish — so applying it would change nothing. What it buys is a database
-- built from this directory alone, which today would have no signup functions
-- at all.
--
-- The usual reason to apply a no-op anyway is to keep `supabase_migrations
-- .schema_migrations` aligned so `db push` sees no pending work. That alignment
-- is already broken repo-wide and not by this file: all 378 committed
-- migrations use date-only prefixes (`20260818_`) while the remote records
-- 14-digit versions (`20260818152754`), and 78 dates carry more than one file.
-- Applying this one migration would not fix that, and rewriting a live
-- auth.users trigger function to gain nothing is not a trade worth making.
--
-- If `db push` does run this later, it is safe: CREATE OR REPLACE with the
-- logic already in place is idempotent.
--
-- Both are already compliant with the repo's SECURITY DEFINER convention (R1 in
-- scripts/db-conventions/check.ts): search_path pinned with pg_temp last.
--
-- ## What this does NOT fix (deliberately — each needs an owner decision)
--
-- The reproducibility hole around signup is wider than these two functions, and
-- the rest is left for a decision rather than folded in silently:
--
--   * The TRIGGERS are drifted too. `on_auth_user_created` and
--     `on_auth_user_created_schools` exist on auth.users in production and
--     appear in no migration. Without them a fresh database has these functions
--     but nothing invoking them. They are not created here because writing to
--     auth.users touches the live signup path.
--   * `debug_signup_log`, which both functions write to on every signup, has no
--     CREATE either, and currently holds 2,203 rows of signup metadata. It is
--     the table SPE-379 flags for unbounded provider PII — so backfilling it
--     without settling retention would enshrine that.
--   * `20250117_create_profile_on_signup.sql` states "we cannot create triggers
--     on auth.users table" and that it "has been updated to not create a
--     trigger on auth.users". Production has had exactly those triggers the
--     whole time, so the committed history asserts the opposite of reality.
--     Left in place rather than edited, because which side is *intended* is a
--     product/security question, not a transcription one.
--
-- ## Note for SPE-184
--
-- `handle_new_user` defaults `role` to 'resource' for any auth user whose
-- metadata omits one — the behaviour SPE-184 describes as having enabled the
-- SSO self-provisioning hole. This migration preserves it exactly, because its
-- job is to capture reality, not change it. But it is a precondition for fixing
-- it: until now there was no committed definition to amend.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_metadata jsonb;
    v_user_id uuid;
    v_email text;
    v_email_domain text;
BEGIN
    -- Get user ID and email from the NEW record
    v_user_id := NEW.id;
    v_email := NEW.email;

    -- Extract email domain
    v_email_domain := split_part(v_email, '@', 2);

    -- Try to log immediately to see if trigger is firing
    BEGIN
        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
        VALUES ('handle_new_user', v_user_id, NULL, 'Trigger fired - starting');
    EXCEPTION WHEN OTHERS THEN
        -- Ignore logging errors
    END;

    -- Check if metadata exists
    IF NEW.raw_user_meta_data IS NULL THEN
        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message, error_message)
        VALUES ('handle_new_user', v_user_id, NULL, 'Error: raw_user_meta_data is NULL', 'No metadata provided');
        -- Don't fail, just return
        RETURN NEW;
    END IF;

    v_metadata := NEW.raw_user_meta_data;

    -- Log metadata received
    BEGIN
        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
        VALUES ('handle_new_user', v_user_id, v_metadata, 'Metadata received, creating profile');
    EXCEPTION WHEN OTHERS THEN
        -- Ignore logging errors
    END;

    -- Create profile WITH EMAIL AND DISTRICT_DOMAIN
    BEGIN
        INSERT INTO public.profiles (
            id,
            email,
            district_domain,
            full_name,
            role,
            state,
            school_district,
            school_site,
            works_at_multiple_schools
        )
        VALUES (
            v_user_id,
            v_email,
            v_email_domain,
            COALESCE(v_metadata->>'full_name', 'Unknown'),
            COALESCE(v_metadata->>'role', 'resource'),
            COALESCE(v_metadata->>'state', 'CA'),
            COALESCE(v_metadata->>'school_district', 'Unknown District'),
            COALESCE(v_metadata->>'school_site', 'Unknown School'),
            COALESCE((v_metadata->>'works_at_multiple_schools')::boolean, false)
        );

        -- Log success
        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
        VALUES ('handle_new_user', v_user_id, v_metadata, 'Profile created successfully');

    EXCEPTION WHEN OTHERS THEN
        -- Log specific error
        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message, error_message)
        VALUES ('handle_new_user', v_user_id, v_metadata, 'Error creating profile', SQLERRM);
        RAISE; -- Re-raise the error
    END;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_schools()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_metadata jsonb;
    v_user_id uuid;
    v_school_district text;
    v_school_site text;
    v_additional_schools jsonb;
    v_school text;
    v_profile_exists boolean;
BEGIN
    v_user_id := NEW.id;
    v_metadata := NEW.raw_user_meta_data;

    -- Log entry
    INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
    VALUES ('handle_new_user_schools', v_user_id, v_metadata, 'Starting schools processing');

    -- Check if user works at multiple schools
    IF (v_metadata->>'works_at_multiple_schools')::boolean = true THEN
        v_school_district := v_metadata->>'school_district';
        v_school_site := v_metadata->>'school_site';

        -- Check if profile already exists
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_user_id) INTO v_profile_exists;

        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
        VALUES ('handle_new_user_schools', v_user_id, v_metadata,
                'Profile exists: ' || v_profile_exists::text);

        -- Only insert primary school if not already exists
        IF NOT EXISTS (
            SELECT 1 FROM public.provider_schools
            WHERE provider_id = v_user_id
            AND school_district = v_school_district
            AND school_site = v_school_site
        ) THEN
            INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
            VALUES ('handle_new_user_schools', v_user_id, v_metadata,
                    'Inserting primary school: ' || v_school_site);

            INSERT INTO public.provider_schools (
                provider_id,
                school_district,
                school_site,
                is_primary
            )
            VALUES (
                v_user_id,
                v_school_district,
                v_school_site,
                true
            );
        ELSE
            INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
            VALUES ('handle_new_user_schools', v_user_id, v_metadata,
                    'Primary school already exists, skipping: ' || v_school_site);
        END IF;

        -- Process additional schools if they exist
        v_additional_schools := v_metadata->'additional_schools';

        IF v_additional_schools IS NOT NULL AND jsonb_typeof(v_additional_schools) = 'array' THEN
            INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
            VALUES ('handle_new_user_schools', v_user_id, v_metadata,
                    'Processing additional schools: ' || v_additional_schools::text);

            FOR v_school IN SELECT * FROM jsonb_array_elements_text(v_additional_schools)
            LOOP
                IF LENGTH(TRIM(v_school)) > 0 THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM public.provider_schools
                        WHERE provider_id = v_user_id
                        AND school_district = v_school_district
                        AND school_site = v_school
                    ) THEN
                        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
                        VALUES ('handle_new_user_schools', v_user_id, v_metadata,
                                'Inserting additional school: ' || v_school);

                        INSERT INTO public.provider_schools (
                            provider_id,
                            school_district,
                            school_site,
                            is_primary
                        )
                        VALUES (
                            v_user_id,
                            v_school_district,
                            v_school,
                            false
                        );
                    ELSE
                        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
                        VALUES ('handle_new_user_schools', v_user_id, v_metadata,
                                'Additional school already exists, skipping: ' || v_school);
                    END IF;
                END IF;
            END LOOP;
        END IF;

        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message)
        VALUES ('handle_new_user_schools', v_user_id, v_metadata, 'Schools processing completed');
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        INSERT INTO public.debug_signup_log (trigger_name, user_id, metadata, message, error_message)
        VALUES ('handle_new_user_schools', v_user_id, v_metadata,
                'Error processing schools. SQLSTATE: ' || SQLSTATE || ', School: ' || COALESCE(v_school, 'primary'),
                SQLERRM);
        RAISE;
END;
$function$;
