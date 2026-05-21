-- Generic per-user API rate limiting (e.g. AI generation endpoints).
-- Written/read only by the service-role client (createServiceClient), so users
-- cannot read or tamper with their own counters via the anon key.
CREATE TABLE public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX api_rate_limits_lookup_idx
  ON public.api_rate_limits (user_id, endpoint, created_at DESC);

-- RLS on with no policies: the anon/user client gets zero access; only the
-- service-role key (which bypasses RLS) can read/write.
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
