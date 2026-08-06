/**
 * The `district_sis_connections` columns a BROWSER session may read.
 *
 * One constant, imported by both the tech portal page and the RLS verification
 * script, because the failure mode otherwise is silent and specific: the page
 * starts selecting a new column, the grant doesn't cover it, and PostgREST
 * refuses the ENTIRE select with 42501 — the portal shows "could not load your
 * integration status" for every district at once. A verification script that
 * checks its own hand-copied subset stays green throughout.
 *
 * This must mirror the GRANT in
 * `supabase/migrations/20260806_spe395_district_sis_connections.sql`. Adding a
 * column here without adding it there breaks the page; the script is what
 * catches that, and it can only catch it if both read from here.
 *
 * Deliberately NOT `*`: on this table `*` expands to the credential columns and
 * is refused outright. That is the designed behaviour (SPE-395) — a loud error
 * rather than silently shipping a district's SIS credential to a browser.
 *
 * No React, no server imports: a plain string so a Node script can import it.
 */
export const BROWSER_CONNECTION_COLUMNS =
  'id, sis_type, base_url, token_url, credential_hint, status, dpa_cleared_at, last_tested_at';
