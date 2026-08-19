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
  **To run a feature verification through the sim district, use the `sim-run`
  skill** (`.claude/skills/sim-run/SKILL.md`) — it carries the spec §9 loop
  plus this environment's Playwright/network mechanics and the shared helpers
  in `scripts/sim-district/walk.ts`; don't re-derive any of it.

## How to communicate with me

I'm a non-technical founder acting as product manager and CEO. Claude Code is
the engineer. Match every update to that — the goal is that I stay genuinely
informed without spending brainpower decoding jargon or skimming past things
that matter.

- **Lead with the takeaway, not the process.** Start with what changed and what
  it means for the product, the user, or the business. Engineering detail stays
  out unless I ask for it.
- **Plain language by default.** No jargon. If a technical point genuinely
  affects a decision I need to make, translate it into one plain sentence
  ("this makes pages load faster," not "this memoizes the render tree").
- **Keep routine updates to a short paragraph** — 3–5 lines. What I did, why it
  mattered, what's next. I should absorb it in a few seconds without skimming.
- **Make decisions impossible to miss.** When you need my input, put it under a
  clear **"⚠️ Your call:"** heading, kept separate from the status update. Lay
  out the options in plain terms, name the tradeoff, and tell me which one you'd
  pick and why. I approve or redirect. (The "Stop and discuss with me first"
  list below defines *when* a decision is mine — this defines *how* you bring it
  to me.)
- **Offer depth, don't force it.** When there's more technical detail available,
  end with a short offer ("want the technical details?") and let me pull it if I
  want it.

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
- Database schema/data migrations, or anything destructive or hard to reverse
  (index-only migrations are the one exception — see the expansion below).
- Security, auth, or permissions changes where I am not fully certain.
- Adding, removing, or upgrading dependencies.
- Anything touching money, secrets, external services, or shared infra.
- Ambiguous requirements, multiple reasonable interpretations, or scope creep
  beyond what we agreed.
- A real bug or regression surfaces that was not part of the plan
  (internal-only bug fixes are the exception — see the expansion below;
  anything a user can see or feel still stops here).

**Expanded auto-deployable categories (approved 2026-08-19).** Two categories
that would otherwise trip the stop list qualify for the autonomous lane when
their guardrails hold; every other gate above still applies to them.

- **Internal-only bug fixes & internal tooling.** A bug fix qualifies when the
  fix changes nothing a user can see or do — it lives in error logging, the
  build, CI, the test suite, sim-district tooling, internal scripts, or
  staff-only `/internal` surfaces — and it lands with a regression test that
  pins it. "User-visible" is broad on purpose: emails, imports, scheduling
  outcomes, and anything reachable from a provider/teacher/admin screen all
  count as visible. Any doubt about visibility means it is not internal —
  leave the label off and bring it to me.
- **Index-only database migrations.** Adding or dropping indexes only — never
  tables, columns, constraints, triggers, functions, policies, or grants.
  Additions use `CREATE INDEX CONCURRENTLY`; drops need advisor/usage evidence
  (cited in the PR) that the index is unused or redundant. Every such PR states
  each migration's one-line rollback in its description, and the standing
  real-session verification rule applies as usual.

**Explicitly NOT auto-deployable — security sweeps (deferred 2026-08-19,
tracked in SPE-569).** Security/permissions work (RLS, grants, EXECUTE
revokes, SECURITY DEFINER hardening) stays out of the autonomous lane even
when it repeats an established convention: prepare the PR end-to-end, hold the
merge for me. Permission failures are silent (SPE-332), so my one click stays
as cheap insurance. Revisit per SPE-569 once the two expansions above have a
few weeks of clean track record.

**Always, regardless of confidence:** never force-push, never merge over branch
protection, never bypass hooks or commit signing, stay on the designated
branch, and keep capturing deferred items in Linear. Report a brief summary
when a batch merges or when escalating — keep me informed without making me a
bottleneck.

**PR follow-through is yours; merging is the pause point.** You never need my
permission to set up PR follow-through — subscribe to / watch a PR's activity
and schedule your own `send_later` check-ins to follow a PR on your own, and
run the whole pre-merge loop (open the PR, watch CI, run reviews, address valid
feedback, push fixes) without asking. **The one action to pause on is merging:**
hold a finished, green PR for me and tell me it's ready rather than merging it
yourself — unless I've given you the go-ahead to merge, for that PR or as a
standing rule for the work at hand (then merge on green without checking back).
The purely-internal, non-UX, all-gates-green case above is the standing
exception where that go-ahead is already granted.

**Standing merge approval — prompt-only assistant tunings (granted 2026-08-12).**
Changes that only adjust the AI assistant's system-prompt wording in
`lib/assistant/chat.ts` (plus their test pins in the matching test file) may
merge on green without asking, like auto-deployable work — report each one
after it ships. This covers wording, style rules, and the in-prompt product
guide/reference content. It does NOT cover: the assistant's data scope (tool
selects in `lib/assistant/tools.ts`), its UI, the API route, disclosures, or
any other code — those still wait for my merge call.

**Tracked in Linear via the `auto-deployable` label.** A ticket carries this
label only if it meets the bar above: purely internal/technical, no user-facing
or UX change, no schema/data migration beyond index-only changes, no
dependency/security/auth/infra change, CI-verifiable, reversible — including
the two expanded categories (internal-only bug fixes with a pinned regression
test; index-only migrations). Apply it when you file or groom a qualifying
ticket (and strip it if scope grows past the bar); filter to it to find work you
can take to merge without me. Per the standing exception above, `auto-deployable`
tickets may be cleared end-to-end — implement → verify → PR → merge once every
gate is green (typecheck, lint, tests, CI, and zero unresolved review threads) —
without checking back. When in doubt, leave the label off.

**Weekly quick-win digest (approved 2026-08-19) — small user-facing fixes,
batched.** Tiny visible fixes (`quick-win` label: renames, copy, one-screen
polish) don't trickle to me one at a time. A Monday routine builds each as its
own green PR with before/after screenshots and sends me one digest; I approve
in a single reply and the approved ones merge. This batches my decision — it
does not delegate it: nothing user-facing merges without my approval.

**Fix-instead-of-file (approved 2026-08-19).** When a session discovers a
small side issue that would itself qualify as auto-deployable and takes under
~30 minutes, fix it in the same session as its own small PR instead of filing
a ticket — capped at two per session so the main task stays on track. File a
ticket only for what can't be done now: too big, outside the bar, or needing
my call.

## How we use Linear (issue statuses)

The workflow is one director (me) and one executor (Claude Code), and work
usually goes from decided to shipped in a single focused push. So statuses stay
deliberately minimal — and, above all, honest. The failure mode here is a
*drifting board* (a ticket stuck "In Progress" long after it shipped; finished
tickets never archived), not too few columns. Keep the statuses true and they
cost nothing.

- **Backlog** — not started. The pool, including follow-ups you discover
  mid-task and log instead of doing right then (small auto-deployable finds
  get fixed, not filed — see fix-instead-of-file above).
- **In Progress** — actively being worked right now. Usually short-lived.
- **In Review** — a finished, green PR waiting on my merge call. This is the one
  genuine "ball's in my court" state (see "merging is the pause point" above).
- **Done** — merged / shipped.
- **To-do** — NOT a required step. Optional only, to stage a visible short-list
  when we deliberately line up a multi-ticket initiative. Don't pre-stage a
  queue by default; the next thing is whatever I point you at.

**Move your own ticket as you work** — this is the habit that keeps the board
honest: to **In Progress** when you start it, to **In Review** once its PR is up
*and green* (the merge decision is now mine), to **Done** when it merges. Never
leave a ticket **In Progress** after its work has shipped.

Auto-archive is on, so completed tickets clear themselves — don't hand-manage
done-ticket clutter.

## Standing rule: deep self-review before any substantive PR

Before marking any substantive PR ready for review (features, bug fixes,
refactors — anything beyond trivial or docs-only diffs), run the `/code-review`
skill at **high** effort on the branch diff, then fix its confirmed findings
or state why one is deferred. Run it proactively — never treat external review
bots (CodeRabbit/Codex) as the review layer: they rate-limit and can post
"review finished" no-ops (seen on PR #704, where the deep self-review caught
staleness races the gates missed). Bot findings remain a complementary layer —
still read and address them when they arrive.

## Standing rule: a user-facing change updates the assistant's product guide

The Speddy Assistant's knowledge of the product is one hand-written string —
`SPEDDY_GUIDE` in `lib/assistant/chat.ts`. **Nothing about it is derived at
runtime.** The assistant cannot read the code, see the app, or notice a deploy.
It knows exactly what that string says and nothing else.

So: **any PR that adds, removes, or changes a user-facing flow updates
`SPEDDY_GUIDE` in the same PR.** Treat the guide as part of the feature, the way
a schema change carries its migration — not as documentation to catch up on
later. "Later" is what produced SPE-539.

What counts as user-facing: a new page, tab, widget, button or modal; a renamed
or moved control; a changed sequence of steps; a rule about who sees what (role
or school-level gating); something that becomes possible or stops being possible.
Backend-only work needs no entry.

Two failure modes, and only one of them is loud:

- **A missing entry** makes the assistant unhelpful — it says it doesn't know and
  points to support. Bad, recoverable.
- **A stale entry** makes it confidently wrong, describing a screen that no longer
  matches what the provider is looking at. This is the one that costs trust, and
  it happens precisely when a flow changes rather than when one is added.

Verify against the JSX, never from memory or from a ticket description — quote
the label the component actually renders. SPE-539 got this wrong even while
writing this rule: SPE-501's commit message says the form "offers an 'Other...'
free-text box", so the guide claimed any activity name can be typed. True of the
*admin* form; the provider's own Special Activities page is a fixed picklist, and
no assistant user can reach the admin one. A ticket describes the change, not the
screen the reader is looking at.

Check the gating too: a button behind `isSecondary` or a role check needs that
condition stated, or the guide sends the wrong provider hunting for it. If a
component exists but nothing mounts it, it does not go in the guide.

Each topic in the guide is pinned by an anchor string in
`__tests__/unit/app/api/assistant/chat.test.ts`. Deleting a topic fails a test;
rewriting a flow does not, so the discipline above is what actually holds.

## Standing rule: verify database-touching work with a real session

Unit tests mock the Supabase client, so they **cannot see RLS at all** — they
pass identically whether a policy permits a write or denies every single one.
Anything whose correctness depends on the database accepting a real request is
therefore uncovered by the suite, no matter how green it is.

So before marking ready any change that (a) reads or writes the database from
the **browser** (the user's own session, not a service client), or (b) touches an
RLS policy, trigger, or grant: exercise **the operation you changed** with a
**real signed-in session**, via a sim-district walk or a probe. Not recommended;
required. A check you satisfy by *reasoning about* the code is not a check.

`npm run sim:verify-rls` does **not** discharge that on its own. It is a
regression guard pinning a fixed `profiles` contract — three specific self-write
columns plus a set of escalation and cross-profile cases — so a new profile
preference, or a changed SELECT policy, sails straight through it untouched.
Run it whenever you touch `profiles` RLS (it catches breakage you didn't intend),
but it substitutes for exercising your own change only when it demonstrably
covers that operation. Treating a fixed suite as proof of an unrelated change is
the same false assurance this rule exists to stop.

Why this is a rule and not a preference: `profiles_update` was recursive and
silently broke **every** self-serve profile write for ~7 months (SPE-332).
SPE-320 then shipped a self-toggle depending on it — behind three green test
files, and after its own ticket had flagged the exact risk and prescribed the
fallback. The confirmation was done by reading the policy, which was true about
the column and useless, because the policy crashed before reaching any column.

Three traps worth knowing when writing these checks:

- **Assert the write persisted, not the status.** PostgREST reports an
  RLS-filtered UPDATE as a 2xx with an empty body. Check rows affected.
- **Assert *why* something was refused.** A value rejected incidentally (type
  coercion, a foreign key) keeps a negative check green even after the guard it
  was meant to test is gone. Match the error, not just the failure.
- **Negative security checks need a fresh fixture.** Against an already-escalated
  target the patch is a no-op, the guard correctly permits it, and the check
  passes for the wrong reason. I hit this exact false negative on SPE-332.
