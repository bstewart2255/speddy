---
name: sim-run
description: Run a feature verification through the Sim District — reset the fixture, walk personas through the real UI with Playwright, assert DB state underneath, and deliver a Sim Run Report. Use whenever asked to test/verify a feature "through the sim district", run cross-role or end-to-end verification, or smoke-test the fixture itself.
---

# Sim District verification run

`docs/SIM_DISTRICT.md` §9 defines *what* a run is and why. This skill is the
*how* for this environment — follow it start to finish and you will not need
to rediscover any of its mechanics. Working precedents: PR #695/#698 (the IEP
meetings run that caught SPE-217) and the fixture smoke walk.

## Non-negotiables (in order)

1. **Freshness contract.** Every run STARTS with
   `npm run sim:reset -- --yes` and a green `npm run sim:verify`. Seeded data
   is date-relative to the seed date; a stale namespace gives wrong answers.
   A failing reset is a finding to fix, never something to work around.
2. **Sweep contract before the run creates rows.** If the feature's tables
   aren't yet classified in `scripts/sim-district/manifest.ts`
   (SEEDED / SWEPT / DECLARED_UNSEEDED), classifying them is part of THIS
   run's setup — `sim:verify` fails on unclassified tables. When adding a
   SWEPT entry, pick the identity (`user` | `student` | `school`) whose sim
   ids reach the rows, and check delete paths: a table with **no cascade from
   students/profiles/schools** (e.g. `site_meeting_rules`) MUST be swept or
   teardown's parent deletes will hit FK violations. Children cleaned by
   `ON DELETE CASCADE` from a swept parent stay DECLARED_UNSEEDED with a
   comment.
3. **Only touch sim data through the scripts.** Read-only SQL for assertions
   is fine (Supabase MCP `execute_sql`); never hand-write or hand-delete sim
   rows.
4. **Credentials.** `derivePassword(SIM_DISTRICT_PASSWORD, email)` +
   `simEmail(local)` from the manifest, computed inside scripts. Never print,
   log, or hardcode a password. `walk.ts#loginAs` does this for you.

## Environment mechanics (Claude remote sandbox)

- **Target the app locally.** The gateway usually blocks `www.speddy.xyz`
  (403 CONNECT). Run the **checked-out worktree** against the prod DB — the
  code under test (pre-merge that is the feature branch; post-merge, main) —
  spec-sanctioned:
  ensure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fetch the anon key with Supabase MCP
  `get_publishable_keys`; the file is gitignored), start `npm run dev` in the
  background, and wait for `curl --noproxy localhost http://localhost:3000/login`
  to return 200.
- **The browser cannot reach Supabase; Node can.** This is the trap that
  wastes hours: pages render but every client-side fetch dies silently —
  empty dashboards, no role nav, no redirects. Never launch Chromium with
  proxy settings; instead create contexts with `walk.ts#newWalkContext`,
  which wires `relaySupabase()` (route interception → Node fetch).
- **Use `scripts/sim-district/walk.ts`.** It carries launch fallbacks,
  the relay, `loginAs`, content-based waits (`bodyHas` — never fixed sleeps;
  dev mode compiles routes on first hit), nav helpers, and check recording.
  A run script should be persona "acts" plus assertions, nothing else.
- **Script location.** Put run scripts in the session scratchpad and import
  repo modules by absolute path (`/home/user/speddy/scripts/sim-district/walk`);
  scratchpad files can't resolve `node_modules` bare specifiers. Run with
  `npx tsx <script>`.
- **Role landings** (middleware + client redirects): admins →
  `/dashboard/admin`, SEA → `/dashboard/sea`, teacher → `/dashboard/teacher`,
  providers stay on `/dashboard`. Non-admins hitting `/dashboard/admin`
  bounce — a free negative assertion.

## Persona quick reference

`PERSONAS` in `scripts/sim-district/manifest.ts` is authoritative — these are
the usual walk leads (email-local → who):

| email-local | persona |
|---|---|
| `district.admin` | Dana — district admin (no Chat, no site-rules editor) |
| `siteadmin.willow` | Priya — site admin, Willow |
| `rsp.willow` | Rachel — resource specialist, Willow (28 students; 12 with due dates; students 0–2 taught by Nora) |
| `rsp.maple` | Alicia — resource specialist, Maple (cross-school negative space) |
| `rsp.itinerant` | Maria — itinerant resource (Maple + Juniper) |
| `slp.itinerant` | Tomás — itinerant speech (Willow/Juniper/Cedar) |
| `ot.itinerant` | Jun — itinerant OT (Maple + Redwood) |
| `sea.willow` | Leah — SEA (excluded from Chat/CARE/Schedule/Meetings nav; delegated sessions) |
| `teacher.willow.1` | Nora — login teacher, Willow (availability prompt) |
| `teacher.willow.2` | David — login teacher with ZERO students (empty state) |
| `teacher.cedar` | Fatima — login teacher, Cedar (secondary) |

Cedar/Redwood are secondary sites: scheduling surfaces hidden, no session
instances seeded — useful negative space.

## The run, step by step

1. **Read the feature first** — its pages, query layer, RLS policies, and
   which personas it touches. Test what actually shipped, not the spec.
2. Classify new tables in the manifest (non-negotiable #2); typecheck
   (`npx tsc --noEmit --skipLibCheck --esModuleInterop --module commonjs --target es2020 --moduleResolution node scripts/sim-district/*.ts`).
3. Reset + verify green; start the local app.
4. Write the walk script as acts in dependency order (e.g. admin configures →
   teacher responds → provider consumes), one `newWalkContext` per persona.
5. Assert **positive AND negative space** per persona — cross-school
   isolation, role exclusions, middleware bounces. Negative assertions are
   mandatory (§9): most multi-role bugs are leaks, and happy-path-only runs
   prove nothing. Screenshot each act.
6. **DB layer** via Supabase MCP `execute_sql` (read-only): row counts,
   scoping columns (`school_id`/`district_id`/organizer), constraint-chain
   properties (times inside configured windows, nothing past due dates,
   nothing at other schools). The DB is the tiebreaker when a UI check races.
7. **Lifecycle close:** `sim:teardown -- --yes` →
   `sim:verify -- --expect-empty` (all zeros proves the sweeps caught the
   run's rows) → `sim:reset -- --yes` + green verify, leaving the district
   standing. Kill the dev server.
8. **Deliver the Sim Run Report** (below) and send screenshots with
   SendUserFile.

## When the run finds a product bug

Reproduce it minimally outside the UI — a signed-in `@supabase/supabase-js`
probe from Node mirrors the app's exact client path and yields the real
PostgREST error (UI layers often swallow them into warnings). File a Linear
issue with root cause + evidence. Then STOP for owner approval before
changing product code (CLAUDE.md stop-list); sim-script fixes are autonomous.
Suspect your own harness first: a relay abort or a racing selector looks
identical to an app bug until the DB or a probe settles it.

## Sim Run Report format

- **Verdict first** — pass/fail and the headline finding.
- **Scope:** what was walked, and an explicit **not covered** list (never
  silently imply coverage).
- **Per persona:** positive and negative assertions, with screenshots.
- **DB layer:** what was verified underneath the UI.
- **Findings:** each with reproduction, root cause if known, Linear link.
  Anything ambiguous is flagged for a human call, never rounded up to a pass.

## Minimal act example

```ts
// scratchpad/my-run.ts — npx tsx scratchpad/my-run.ts
import {
  BASE_URL, bodyHas, launchBrowser, loginAs, newWalkContext, record, summarize,
} from '/home/user/speddy/scripts/sim-district/walk';

const browser = await launchBrowser();
const ctx = await newWalkContext(browser);
const page = await loginAs(ctx, 'rsp.willow');
await page.goto(`${BASE_URL}/dashboard/meetings`, { waitUntil: 'domcontentloaded' });
record('Rachel (resource, Willow)', 'positive', 'meetings page loads caseload stats',
  await bodyHas(page, 'Unscheduled with due dates'));
await ctx.close();
await browser.close();
process.exit(summarize() > 0 ? 1 : 0);
```
