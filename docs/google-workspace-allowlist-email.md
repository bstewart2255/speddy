# Draft: allowlist request email to district IT

Cover email for `google-workspace-allowlist-packet.md`. Fill the two
placeholders (client ID, attachment/link), adjust the optional line about
your role, and send from whichever address you prefer.

---

**To:** [District IT / Google Workspace administrator]
**Subject:** App access request: Speddy (special-education scheduling) — one OAuth client to trust

Hi [name],

I'm writing to request that Speddy be marked as a trusted app in the
district's Google Workspace admin console. [Optional: I'm a
special-education provider in the district and also Speddy's developer, so
happy to answer anything directly.]

Speddy is a FERPA-positioned special-education service management platform
(scheduling, IEP compliance). Its newest feature is rolling out in phases:
staff first connect their Google Calendar (live today), and the meeting
scheduler will then use those connections to check staff **free/busy
availability** and send meetings as normal Google Calendar invites. We're
requesting approval once, ahead of that rollout. Per the district's
recent policy on unverified third-party connections, staff who try to
connect their district Google account currently see Google's
"Access blocked: admin_policy_enforced" screen.

The specific action:

> **Admin console → Security → Access and data control → API controls →
> App access control → Configure new app** → search for client ID
> `<CALENDAR_OAUTH_CLIENT_ID>.apps.googleusercontent.com` → mark **Trusted**.

Key points, detailed in the attached one-page packet:

- **Per-user consent only** — no service account, no domain-wide delegation;
  trusting the app just lets individual staff choose to connect.
- **Minimal scopes** — free/busy availability plus managing events on the
  user's **own** calendar (Google's wording: see, create, change, delete);
  no Gmail, Drive, or Contacts, and free/busy shows times only, not event
  contents.
- **Staff accounts only** — no student Google accounts are involved.
- Tokens are encrypted at the application layer, never logged, and
  revocable by the user, by Speddy, or domain-wide by you at any time.
- Speddy is offered to California LEAs under the CA-NDPA Standard v1.5
  (CITE/CSPA); the technical security overview, data inventory, and
  subprocessor list are available on request.

Attached: [Google Workspace App Access Request packet]. I'd welcome a quick
call if that's easier — and if the district would like the NDPA executed as
part of this review, we're ready to do that too.

Thanks,
Blair Stewart
Orchestrate LLC (Speddy) · help@speddy.xyz
