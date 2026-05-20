-- Add 'district' as an allowed audience value on landing_signups so the
-- /how-it-works page's final CTA can tag pilot interest from district leaders
-- distinctly from the provider/admin captures on the homepage.

alter table public.landing_signups
  drop constraint landing_signups_audience_check;

alter table public.landing_signups
  add constraint landing_signups_audience_check
  check (audience is null or audience in ('provider', 'admin', 'district'));
