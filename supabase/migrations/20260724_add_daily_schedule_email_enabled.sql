-- SPE-320: Daily schedule emails — provider opt-in flag.
--
-- Additive, non-destructive: one boolean column on `profiles`, off by default
-- for everyone. Providers flip their own value client-side (the existing
-- `profiles_update` self-UPDATE RLS policy + the table-level UPDATE grant to
-- `authenticated` cover this column; the policy's WITH CHECK constrains only
-- role/is_speddy_admin/school_id/district_id, not this column). Resource
-- specialists flip an SEA's value server-side via /api/settings/sea-daily-email
-- using the service client, since RLS does not permit cross-profile writes.

alter table public.profiles
  add column if not exists daily_schedule_email_enabled boolean not null default false;

comment on column public.profiles.daily_schedule_email_enabled is
  'SPE-320: when true, the user receives their daily schedule by email on weekday mornings (Vercel cron 0 14 * * 1-5 UTC). Off by default.';
