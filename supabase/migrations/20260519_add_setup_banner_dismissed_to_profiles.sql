-- Persist dismissal of the onboarding setup banner on the user's profile, so
-- the banner stays dismissed across devices and browsers instead of only being
-- remembered in localStorage.

alter table public.profiles
  add column if not exists setup_banner_dismissed boolean not null default false;

comment on column public.profiles.setup_banner_dismissed is
  'Set to true when the user dismisses the onboarding setup banner via the X button. Persists dismissal across devices/browsers.';
