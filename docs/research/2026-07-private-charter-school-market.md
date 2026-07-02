# Market Research: Private & Charter Schools as a Speddy Target Market

> **Date:** 2026-07-02
> **Question:** Can Speddy — built around public elementary schools — be leveraged
> (with modification if needed) by private and charter schools, i.e. schools that
> can adopt software without public-district approval? What are those schools
> doing today to meet special-education needs, and does Speddy's current offering
> fit?
>
> **Method:** Two parallel tracks. (1) A deep-research web sweep across five
> angles (private-school SPED practice, charter SPED structure, market sizing,
> competing software, buying process); 22 sources fetched, 29 falsifiable claims
> extracted, 25 adversarially verified with 3-vote panels (21 confirmed, 4
> refuted). (2) A full inventory of Speddy's codebase to measure how coupled the
> product is to public-district / IDEA / IEP constructs. Confidence labels and
> verification votes are carried through below.

---

## Bottom line

**The opportunity is real but it is two different opportunities, and they are not
equally close.**

- **Charter schools are the nearer, better-fitting segment.** They are public
  schools that run IEPs under IDEA — Speddy's existing domain model largely
  matches — and they purchase software at the school or network level without a
  district gate. The segment is large and growing (~8,000 schools, 3.7M
  students, ~425K students with disabilities). In California, SEIS has
  effectively closed the IEP-*writing*/compliance category via SELPAs, but no
  verified incumbent covers Speddy's actual category — **provider scheduling and
  session management** — which is exactly the complement to SEIS, not a
  competitor to it.
- **Private schools are a real but structurally different market.** They sit
  outside the IEP framework entirely: the compliance workflow (equitable-services
  plans / ISPs) and its IDEA funding belong to the *public district* where the
  school sits, while the private school's own need — the one the parent pressure
  lands on — is its **discretionary learning-support layer**: accommodation
  plans, learning specialists, and support-session delivery it chooses to fund.
  Serving this buyer requires decoupling Speddy from "IEP" as the organizing
  object and from the mandatory district hierarchy, plus a self-serve billing
  path. The lift is meaningful but bounded, and the competitive field in this
  exact niche (support-service *scheduling* for private schools) appears empty.

**Recommended sequencing:** validate charters first (lowest product delta,
provable demand, vendors already treat them as a buyer segment), and treat the
private-school "learning-support OS" as a second act that reuses the same
decoupling work (standalone-school org model, plan-agnostic goals, self-serve
billing).

---

## Part 1 — What the market looks like

### 1.1 Charter schools: size and SPED load

*(Confidence: high; NCES Fast Facts + NCES CCD, verified 3-0 across 4 merged
claims)*

- ~**7,800 charter schools** in SY 2021-22 (up from ~5,300 in 2010-11; ~8,010 by
  2023-24), enrolling **3.7M students** (up from 1.8M in fall 2010). Charters
  grew from 5% → 8% of all public schools and 4% → 7% of public-school students
  over that decade — a growing addressable base.
- Caveat: school count overstates *purchasing decision units* — CMO-managed
  networks often buy at network level (which cuts both ways: fewer deals, bigger
  deals).

*(Confidence: high; GAO-12-543 + Center for Learner Equity/CRDC, verified 3-0)*

- Charters enroll students with disabilities at **lower and more unevenly
  distributed** rates than traditional public schools: 8.2% vs 11.2% in the
  2009-10 GAO baseline, narrowing to roughly **11.5% vs 14%** by 2020-21. That
  implies ~**425K students with disabilities in charters** today, but per-school
  caseloads vary widely — so per-school value of a scheduling tool varies too.
  Qualification/targeting (e.g., minimum caseload) will matter for sales
  efficiency.

**Refuted framing to avoid** *(0-3)*: "only own-LEA charters own the full SPED
function Speddy targets." The LEA-status story is more nuanced than that binary,
and the research did **not** produce a verified account of own-LEA vs
district-arm charter obligations, nor of CMO-vs-standalone purchasing autonomy.
Both remain open questions (§4).

### 1.2 California charters: SEIS closes one category, leaves ours open

*(Confidence: high; seis.org, El Dorado Charter SELPA guides, cross-validated
against competitor SIRAS's claimed footprint; verified 3-0 across 5 merged
claims)*

- **SEIS** (operated by CEDR Systems, a department of the San Joaquin County
  Office of Education) has near-saturation coverage of California: **113-115 of
  ~136 SELPAs, 1,500+ LEAs**, including charter LEAs via SELPAs like the
  statewide El Dorado Charter SELPA. Cross-SELPA student-record portability is a
  genuine network-effect lock-in.
- SEIS's scope: IEP writing, SPED data management, CALPADS reporting, and
  service-*delivery logging* with integrated Medi-Cal Interim Reimbursement
  billing.
- **What SEIS does not do:** provider calendars, session scheduling, caseload
  management. Verifiers specifically searched for these and found none.
- Implications: (a) don't compete with SEIS on IEP writing in CA — integrate or
  coexist; (b) Medi-Cal-linked service documentation is the feature bar any
  service-tracking claim will be measured against; (c) Speddy's scheduling core
  is the open gap, and "works alongside SEIS" is the natural CA charter pitch —
  notably, Speddy already imports SEIS exports (`lib/parsers/seis-parser.ts`),
  which is a ready-made wedge.

### 1.3 Private schools: the structural split

*(Confidence: high; 34 CFR 300.130–300.144, US ED Q&A, WA PAVE; verified 3-0
across 3 merged claims)*

The single most important structural fact for product strategy:

- Parentally-placed IDEA-eligible students in private schools get an
  **"equitable services" plan** (a *services plan* under 34 CFR 300.138), **not
  an IEP**. Responsibility, record-keeping, and the funding stream (the IDEA
  **proportionate-share set-aside**) belong to the **public district where the
  private school is physically located**.
- So "selling service-plan compliance to private schools" is partly a
  misnomer — that workflow's owner and payer is the district. (Speddy already
  brushes against this from the district side: CARE's Lane B treats
  "private-school referral" as a compliance intake source.)

*(Confidence: medium; NAIS Independent Ideas, Aug 2022 — the independent-school
trade association's publication, but a single secondary source; verified 3-0
across 3 merged claims)*

What private schools *themselves* own — and where the user's hypothesis about
internal/parent pressure is directionally supported:

- Independent schools build **discretionary in-house learning-support
  capacity**: they decide what academic/behavioral support to offer, hire
  learning specialists, and run systems for identifying and tracking students
  with **individual support plans and accommodations**.
- The demand rationale is **market-driven**: an estimated 1-in-5 children has a
  learning disorder, and school-choice dynamics make serving them an
  *enrollment* opportunity. Resourcing the function is framed as a
  board-and-head-of-school strategic commitment.
- **Refuted framing to avoid** *(0-3)*: "identification typically arrives as a
  public-school IEP or private neuropsych eval." How documentation actually
  arrives at private schools was not verified — don't build onboarding
  assumptions around it without primary discovery.

**Honest gap:** no claims about private-school *market size, budgets, or
willingness to pay* survived verification. The commonly-cited ~30K US private
schools figure was not verified in this pass. Private-school TAM math is
incomplete (§4).

### 1.4 Competitive landscape

*(Confidence: medium; vendor sites block bots, so verification leaned on
search-indexed snippets triangulated across queries; verified 3-0 across 3
merged claims)*

- **Education Modified (EdMod)** is the closest player in the
  accommodations/service-tracking category — and it is an
  **information-sharing/collaboration platform** (IEP/RTI/504/ELL/GT snapshots,
  accommodations visibility for gen-ed staff), **not** a scheduling,
  session-logging, or caseload-management system. Adjacent, not directly
  competitive with Speddy's core.
- EdMod **validates both segments**: it markets explicitly to charter leaders
  (dedicated public-charter solutions page, charter-leader webinars) and reaches
  private/faith-based schools through a March 2026 partnership with **FACTS
  (Nelnet)** — the dominant private-school SIS/tuition platform. That FACTS
  partnership is also a signal about private-school distribution channels.
- **Watch item:** EdMod was **acquired by Presence in May 2026**. Presence is a
  teletherapy/provider-network company that already schedules sessions —
  combining that with EdMod's accommodations layer could turn the closest
  adjacent player into a direct competitor. (Open question §4.)
- **Coverage gap:** national IEP platforms serving charter LEAs outside CA
  (Frontline/EasyIEP, PowerSchool Special Programs, Embrace, SpedTrack) were not
  investigated in this pass — whether Speddy's "scheduling gap" is national or
  CA-specific is unverified (§4).

### 1.5 Buying process and decision-makers

*(Confidence: medium — directional; one vendor's GTM plus one NAIS article;
verified 3-0)*

- Incumbent GTM is **sales-led and institutional, not self-serve**: EdMod
  publishes no pricing, sells annual enterprise licenses **priced per school
  site** with district/multi-year volume discounts, and routes prospects through
  consultation/demo funnels.
- **Charters** buy at the school or network level — per-site subscriptions, no
  district gate. This is the segment's core attraction for Speddy: the school
  *is* the buyer.
- **Independent schools:** the strategic budget commitment sits with the board
  and senior leadership; the likely tool-level buyers are **heads of school,
  division heads, and learning-support directors**.
- No verified account of CMO-vs-standalone purchasing mechanics — treat per-site
  annual pricing as the starting hypothesis and validate in discovery.

---

## Part 2 — Speddy fit-gap (from the codebase)

### 2.1 What already fits

- **The scheduling core is the differentiated asset.** Auto/manual placement
  against bell schedules and special activities, conflict detection,
  template→instance recurring sessions, SEA/specialist delegation, group
  sessions — nothing verified in the competitive sweep does this for
  school-based providers.
- **For charters, the domain model is essentially right already.** Charters run
  IEPs; Speddy's IEP goals, accommodations, service minutes
  (`sessions_per_week`/`minutes_per_session`), IEP/triennial dates,
  goal-indexed progress monitoring (exit tickets, progress checks, manual
  progress), and AI lesson/worksheet generation all apply as-is.
- **SEIS import is a ready-made CA-charter wedge** (`lib/parsers/seis-parser.ts`
  + CA service-type code mapping): "keep SEIS for compliance, run your providers
  on Speddy" onboards from the file the school already exports.
- **CARE already knows private schools exist** — from the district side: Lane B
  compliance intake includes `private_school` as a referral source with the CA
  Ed. Code 56321 15-day assessment-plan clock. Useful for the
  district-facing equitable-services angle; not a private-school-as-customer
  feature.

### 2.2 Gaps for charters (small)

- **No SELPA concept anywhere in the codebase.** CA charters affiliate with
  SELPAs (often the statewide El Dorado Charter SELPA), not geographic
  districts. Likely handled as metadata/labeling rather than a new hierarchy
  level, but sales conversations will surface it immediately.
- **Org model assumes NCES-seeded geographic districts.** A charter that is its
  own LEA fits awkwardly under a geographic district row; the internal portal
  can create synthetic districts (`internal/create-district`), which works but
  is manual.
- **Secondary-school support is still partial** (one-teacher-per-student model,
  SPE-194; presentation-only gating, SPE-193) — relevant since many charters are
  6-12 or K-12.

### 2.3 Gaps for private schools (the real product work)

1. **The district is hard-required.** `schools.district_id` is `NOT NULL`
   (`20250806_create_school_structure_tables.sql`), `profiles.school_district` /
   `school_site` are `NOT NULL`, and signup forces State → District → School
   typeahead from NCES-seeded tables. A standalone private school cannot exist
   in the model today without a synthetic district hack. A first-class
   "independent school" org type is the foundational change.
2. **IEP is the organizing object everywhere.** `iep_goals`, `iep_goal_index`
   keys across exit tickets / progress checks / manual progress,
   `upcoming_iep_date` / `upcoming_triennial_date`, the 13 federal disability
   categories, CA Ed. Code timelines in CARE. Private schools run **support
   plans / accommodation plans** with no statutory clocks. The abstraction is a
   rename-plus-generalize ("student support plan" with goals and
   accommodations), not a rebuild — the *mechanics* (goals, sessions, minutes,
   progress data) transfer cleanly.
3. **No live billing.** A per-provider Stripe subscription (with referral
   credits, June/July summer pause, SEA free tier) was scaffolded in the DB
   (`20250710_payment_system.sql`) but never wired to any UI/API. Private and
   charter schools are *direct-purchase* customers; some monetization path —
   even the sales-led per-site license the incumbents use — must exist before
   either segment can be onboarded commercially.
4. **Signup gating assumes public-school email domains** (`.edu/.org/.k12/.gov/.us`)
   — mostly fine for privates (`.org` is common) but worth revisiting; and the
   compliance checklist language ("district permission") doesn't fit.
5. **Terminology throughout the UX** (district admin, SEIS upload, IEP goals
   tab) would need an independent-school skin.

### 2.4 What transfers with zero change

Scheduling engine, caseload management, progress-monitoring data collection,
AI lesson/worksheet/exit-ticket generation (grade-driven, not
school-type-driven), CARE-style referral intake (Lane A "discussion" lane is
statute-free already), chat, and the multi-school provider model (itinerant
learning specialists serving several campuses is common in both segments).

---

## Part 3 — Opportunity assessment

| | Charter | Private |
|---|---|---|
| Segment size | ~8,000 schools, 3.7M students, ~425K SWD (verified) | Unverified in this pass (~30K schools commonly cited; needs validation) |
| Regulatory frame | IDEA/IEP — matches Speddy today | Equitable services owned by district; school's own layer is discretionary accommodation plans |
| Product delta | Small: SELPA labeling, own-LEA org fit, secondary-school work | Large-but-bounded: district-optional org model, plan-agnostic goals, billing, terminology |
| Buyer | School leader / network; no district gate (verified) | Head of school / learning-support director; board sets budget (medium confidence) |
| Competition | SEIS owns CA IEP-writing (coexist, don't compete); scheduling gap open; national IEP platforms unexamined | EdMod/Presence adjacent (accommodations visibility, now with a scheduling parent company); FACTS is the distribution incumbent |
| Monetization precedent | Per-site annual enterprise license, sales-led (EdMod) | Same, plus FACTS-style channel partnerships |

**Strategic read:**

1. **Charter-first.** It's the same product with small additions, the buyer can
   sign without a district, the segment is verified-large, and the CA wedge
   ("Speddy + SEIS") is concrete. The main pre-work is answering the
   own-LEA/CMO purchasing question (§4) and turning on *some* billing.
2. **Private-school second, deliberately.** The user's pressure hypothesis is
   directionally supported (NAIS frames neurodiversity support as an enrollment
   imperative), and the niche — scheduling/tracking the school's own
   learning-support delivery — appears unoccupied. But the verified structure
   says the *compliance* dollars sit with districts, so the private-school
   product is a **discretionary learning-support OS**, sold on organization and
   parent-visible delivery, not on compliance. That product needs the
   decoupling work in §2.3 and real willingness-to-pay discovery before
   committing.
3. **A third angle fell out of the research:** the *district-side* equitable-
   services workflow (proportionate share, ISPs for privately-placed students)
   is a natural extension of Speddy's existing district product and CARE Lane B —
   serving private-school students without changing the buyer.

## Part 4 — Open questions / next research steps

1. **CMO vs standalone charter purchasing:** who signs, at what level, for what
   fraction of the ~8,000 schools? (The LEA-status claim was refuted as framed —
   needs primary discovery, e.g. 5-10 charter SPED-director interviews.)
2. **Private-school TAM:** how many of the US private schools have formal
   learning-support programs, what do they budget, and will they pay for
   scheduling/tracking of plans they administer themselves? (Nothing survived
   verification here.)
3. **Is the scheduling gap national?** Audit Frontline EasyIEP, PowerSchool
   Special Programs, Embrace, SpedTrack for provider-scheduling features.
4. **Presence + EdMod:** does the acquirer combine its teletherapy scheduling
   with EdMod's accommodations layer into a direct competitor? Monitor.
5. **Willingness-to-pay + pricing model:** validate per-site annual licensing
   against Speddy's scaffolded per-provider subscription before wiring billing.

---

## Appendix — Verification record

**Confirmed findings:** 7 synthesized from 21 claims, each passing a 3-voter
adversarial panel. Claim → source map:

| # | Finding (section) | Confidence | Panel vote | Sources |
|---|---|---|---|---|
| F1 | Charter segment size & growth (§1.1) | High | 3-0 ×4 merged claims | [NCES Fast Facts #30](https://nces.ed.gov/fastfacts/display.asp?id=30); [NCES CoE charter enrollment](https://nces.ed.gov/programs/coe/indicator/cgb/public-charter-enrollment) |
| F2 | Charter SWD enrollment rates & distribution (§1.1) | High | 3-0 ×2 | [GAO-12-543](https://www.gao.gov/products/gao-12-543); 2024 Center for Learner Equity analysis of 2020-21 CRDC |
| F3 | Equitable services owned/funded by districts (§1.3) | High | 3-0 ×3 | 34 CFR 300.130–300.144 (ecfr.gov); [US ED IDEA Q&A, rev. Feb 2022](https://sites.ed.gov/idea); [WA PAVE](https://wapave.org/navigating-special-education-private-school/) |
| F4 | Private schools' discretionary learning-support layer (§1.3) | Medium | 3-0 ×3 | [NAIS Independent Ideas, Aug 2022](https://www.nais.org/learn/independent-ideas/august-2022/is-your-school-ready-to-support-neurodiversity/) (single secondary source) |
| F5 | EdMod adjacent-not-direct competitor; Presence acquisition (§1.4) | Medium | 3-0 ×3 | [educationmodified.com](https://educationmodified.com/); info.educationmodified.com charter webinar; pulse2.com acquisition coverage, May 2026 |
| F6 | SEIS near-saturation of CA SELPAs; no scheduling features (§1.2) | High | 3-0 ×5 | [seis.org](https://seis.org/); [El Dorado Charter SELPA guides](https://charterselpa.org/); SJCOE/CEDR documentation; cross-checked vs SIRAS's claimed footprint |
| F7 | Sales-led, per-site buying process (§1.5) | Medium | 3-0 ×2 | [EdMod district pricing](https://educationmodified.com/district-pricing/); NAIS Aug 2022 (directional — one vendor + one article) |

**Refuted claims (do not rely on these):**
- Own-LEA vs district-arm charter SPED responsibility binary (0-3, GAO-12-543).
- "Disability documentation arrives at private schools as IEPs or neuropsych
  evals" (0-3, NAIS).
- "Charters enroll less in *every* one of the 13 IDEA categories" (0-3, GAO).
- "EdMod's installed base is primarily public districts" (1-2, split).

**Method caveats:** several key sites (educationmodified.com, nces.ed.gov,
nais.org, partially seis.org) block automated fetches, so those claims were
verified via triangulated search-index snippets; SEIS/EdMod figures are
self-reported marketing numbers, cross-checked where possible (e.g., against
competitor SIRAS's claimed SELPA count). NCES charter figures run through
2023-24; GAO SPED-enrollment splits are 2009-10 baselines updated by 2024
CLE/CRDC analysis.

**Primary sources:** NCES Fast Facts (charter counts/enrollment), GAO-12-543
(SPED enrollment splits), 34 CFR 300.130-300.144 + US ED Q&A (equitable
services), seis.org + El Dorado Charter SELPA (CA coverage),
educationmodified.com (competitor GTM), NAIS Independent Ideas Aug 2022
(independent-school learning support).

**Codebase evidence:** `docs/ARCHITECTURE.md`;
`supabase/migrations/20250806_create_school_structure_tables.sql` (district NOT
NULL), `20250710_payment_system.sql` + `20250711_sea_payment_exemption.sql`
(dead billing), `20260516_care_lane_b_compliance.sql` (private-school referral
lane); `lib/parsers/seis-parser.ts`, `lib/parsers/service-type-mapping.ts` (CA
service codes); `lib/constants/care.ts` (13 IDEA categories, Ed. Code 56321
clocks); `app/(auth)/signup/signup-form.tsx` (forced State→District→School
chain).
