- Use the Supabase MCP server for any information or context needed about the database.
- The Github repo we are using is /bstewart2255/speddy.
- Use the Context7 MCP server whenever there is a question of code best practices, or before implementing any large feature set.
- Use the Github CLI tool to manage actions in the repo.
- When encountering a complex issue, or a bug that is proving difficult to resolve, use Web Search to investigate the problem and receive support in finding a solution.
- Don't over-engineer anything. It's better to add more later, than to have to go back and fix what's been done. At any juncture point, ask yourself, "Is this over-engineering?"
- **Architecture reference:** `docs/ARCHITECTURE.md` is the grounded, how-it-works
  map of the domain model — roles & permissions, org hierarchy/scoping, account
  creation, auth/session, the scheduling model, data retention, and CARE. Read it
  to get up to speed fast; it's cross-referenced to the relevant Linear tickets
  and to the "Speddy" Miro board. When you change one of those areas, update the
  matching section (each ends with a "Source of truth" file list).
- **Sim district:** permanent fake tenant in the prod DB for cross-role,
  end-to-end verification; spec + personas in `docs/SIM_DISTRICT.md`. Lifecycle:
  `npm run sim:reset -- --yes`, `npm run sim:verify`, `npm run sim:teardown -- --yes` (env vars
  are configured in the Claude remote environment). **Freshness contract:**
  every verification run STARTS with a reset and a green `sim:verify` — seeded
  data is date-relative to the seed date, so a stale namespace gives wrong
  answers; a failing reset is a finding to fix, never something to work around.
  `sim:verify` also fails on any public table the manifest doesn't classify —
  when a feature adds tables, classifying them in
  `scripts/sim-district/manifest.ts` (seeded / swept / declared-unseeded) is
  part of that feature's work. Only ever touch sim data through these scripts.

## Autonomous execution for high-confidence, non-UX work

For work that is purely technical and internal, proceed end-to-end without
asking for approval at each step — implement, verify, commit, push, open a PR,
watch CI and review bots, address valid feedback, merge when green, log
follow-ups in Linear, and continue to the next batch. Treat me as a teammate
with merge rights operating inside an agreed objective, not a gate to ask at
every turn.

**Proceed autonomously (and merge) only when ALL of these hold:**
- The change is purely technical/internal: refactors, standardizations,
  type-safety, tests, internal tooling, dead-code removal.
- It does NOT change user-facing behavior or UX in any way, even subtly.
- It is verifiable by automated gates: typecheck, lint, tests, and CI all
  green, with zero unresolved review threads.
- It is reversible / low blast radius (a follow-up commit could undo it).
- It is within an objective we already agreed on.
- Confidence is genuinely high — the pattern is established, not a guess.
  When leaning on confidence, weight the objective gates above more than gut
  feel, and bias toward escalating when anything is fuzzy.

**Stop and discuss with me first if ANY of these are true:**
- Any user-facing or UX change, or any change in behavior.
- Database schema/data migrations, or anything destructive or hard to reverse.
- Security, auth, or permissions changes where I am not fully certain.
- Adding, removing, or upgrading dependencies.
- Anything touching money, secrets, external services, or shared infra.
- Ambiguous requirements, multiple reasonable interpretations, or scope creep
  beyond what we agreed.
- A real bug or regression surfaces that was not part of the plan.

**Always, regardless of confidence:** never force-push, never merge over branch
protection, never bypass hooks or commit signing, stay on the designated
branch, and keep capturing deferred items in Linear. Report a brief summary
when a batch merges or when escalating — keep me informed without making me a
bottleneck.
