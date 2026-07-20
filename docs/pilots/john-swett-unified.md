# John Swett Unified — Pilot Onboarding & Vendor Review Package

Internal tracker for onboarding **John Swett Unified School District** (our first
pilot district) and for the privacy/security package its technology team reviews.
Contra Costa County, CA · NCES LEA `0618990` · <https://www.jsusd.org>.

> **Internal doc.** This is our checklist. It marks which artifacts go to the
> district and which stay internal. Do **not** send this file to the district —
> the district-facing materials are listed under §1.

---

## 1. What the district's tech team reviews (shareable)

| # | Document | What it is | Where it lives | Status |
|---|----------|-----------|----------------|--------|
| 1 | **Technical & Security Overview** | Architecture, auth, encryption, RLS, data handling, subprocessors, compliance, IT requirements, FAQ | `docs/speddy-technical-security-overview.md` | Ready (v2.1) |
| 2 | **Privacy Policy** | Public privacy policy | speddy.xyz/privacy (updated Jul 11, 2026) | Live |
| 3 | **Terms of Service** | Public terms | speddy.xyz/terms | Live |
| 4 | **FERPA Notice** | FERPA "school official" posture | speddy.xyz/ferpa | Live |
| 5 | **Incident Response Plan** | Written IR plan (breach detection, 72-hr LEA notice) | `docs/incident-response-plan.md` | Ready — share on request (quick DPO glance first) |
| 6 | **CA-NDPA** | The agreement the district signs, via CITE / CSPA | CITE/CSPA fillable form | Draft filled; pre-signing items open (§3) |

**Available on request** (usually only if their team digs deeper): data inventory
(`docs/data-inventory.md`), subprocessor register (`docs/subprocessors.md`),
NIST CSF self-assessment (`docs/security-framework-mapping.md`), offboarding /
deletion runbook (`docs/offboarding-runbook.md`).

**Keep internal (do NOT send):** the CA-NDPA execution packet
(`docs/ndpa/ca-ndpa-execution-packet.md`) and attorney review brief
(`docs/ndpa/attorney-review-brief.md`) — our own working notes.

---

## 2. District setup in Speddy (done / pending)

| Step | Status | Detail |
|------|--------|--------|
| District record | ✅ Created | `John Swett Unified` — NCES `0618990`, state `CA`, Contra Costa |
| Schools | ✅ Created | Rodeo Hills Elementary (K–5), Carquinez Middle (6–8), John Swett High (9–12) — real NCES IDs |
| District admin — **Megan Tucker** (`mtucker@jsusd.org`) | ⏳ Not yet created | **To be created** by a Speddy admin via `/internal` → district → **Create District Admin**. After creation, set `must_change_password` on her profile so she must rotate the one-time temp password at first login (SPE-190 mitigation). |

The middle and high schools are typed `Middle` / `High`, so they get the
secondary-school experience; Rodeo Hills gets the full elementary experience.

---

## 3. Pre-signing items (close before John Swett *signs* — not before they review)

- **Vercel Hobby → Pro upgrade (SPE-173, open).** The hosting DPA only applies to
  Pro/Enterprise; a commercial pilot needs Pro. Real blocker for subprocessor
  flow-down.
- **Attorney FERPA/COPPA sign-off.** The attorney review brief is prepared; final
  counsel sign-off should be confirmed on record.
- **Subprocessor DPA housekeeping.** OpenAI/Anthropic done (SPE-163). Confirm the
  Supabase DPA is signed and the Sentry DPA accepted, and save copies.
- **CITE Exhibit H question (SPE-172, open, minor).** How variances attach, given
  v1.5 has no Exhibit H page.
- **Audit logging (SPE-169, open).** Named in the attorney brief as the most
  material security gap; decide whether to disclose as an accepted interim
  variance (RLS + auth are in place today).

---

## 4. Notes

- The Technical & Security Overview was corrected (v2.1, Jul 2026): it previously
  described "self-signup restricted to educational email domains"; the
  self-registration flow was removed, so accounts are administrator-provisioned.
  **Residual gap closed 2026-07-20 (SPE-111):** production Supabase Auth
  `enable_signup` was disabled in the dashboard, so admin-only provisioning is now
  enforced at the authentication layer (admin creation uses `auth.admin.createUser`,
  which is unaffected). The overview's "administrator-provisioned" wording is now
  fully backed.
- The portal's temp password is **not** force-rotated by default (SPE-190).
  Mitigation for this account: after Megan is created, set `must_change_password =
  true` on her profile so she is locked to `/change-password` and must rotate the
  bootstrap password before using the app.
