-- Email captures from the marketing landing page signup form.
-- Writes go through the /api/landing-signup route using the service role key;
-- the table stays locked down with RLS enabled and no public policies.

create table if not exists public.landing_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  audience text,
  created_at timestamptz not null default now(),
  constraint landing_signups_email_not_blank check (length(trim(email)) > 0),
  constraint landing_signups_audience_check check (audience is null or audience in ('provider', 'admin'))
);

alter table public.landing_signups enable row level security;

comment on table public.landing_signups is 'Email captures from the marketing landing page signup form. Writes go through the /api/landing-signup route using the service role key; no public RLS policies.';
