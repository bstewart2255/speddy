-- SPE-447: the district roster remembers who SEIS lists as each student's case
-- manager, so a provider's claim list can arrive with the likely ones already
-- ticked instead of asking them to scan ~45 names.
--
-- A HINT, NOT AN ASSIGNMENT. Case manager is not the same role as service
-- provider — measured on the pilot district, one SLP serves 42 students while
-- being case manager for 17, and three high-school students sit on a different
-- resource teacher's caseload than their SEIS label implies. Nothing reads this
-- column to decide anything; it only pre-selects checkboxes the provider still
-- confirms.
--
-- Free text on purpose. It is a NAME as the district's own SEIS spells it, with
-- no account behind it — matching it to a Speddy provider is a display-time
-- comparison that fails safe (no match simply means nothing is pre-ticked).
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS case_manager text;

COMMENT ON COLUMN public.children.case_manager IS
  'SPE-447: the case manager named on the district''s SEIS roster, verbatim. A hint used to pre-select a provider''s likely students on the claim screen — never an assignment, and never read to grant access.';
