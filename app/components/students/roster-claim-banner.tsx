'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Types come from the planner, never re-declared: `import type` is erased at
 * compile time, so no server-only code reaches this bundle and the shapes
 * cannot drift from what the route returns.
 */
import type { ClaimPlan, RosterFieldKey, RosterUpdateOffer } from '@/lib/district-roster/claim-plan';

/**
 * "Your district put students on the roster" — the provider's whole entry point
 * to SPE-447 slice 2.
 *
 * Two things, kept apart because they carry different risk:
 *
 *   * Students at this provider's school whose services for THIS provider's
 *     discipline nobody has picked up (SPE-577): a student with academic,
 *     speech and OT services appears on all three providers' lists, and each
 *     claim only closes that one discipline — except that counseling and
 *     psychologist claim as ONE discipline (both deliver the same services),
 *     and a generalist's (specialist/intervention) claim closes every
 *     discipline. (Students the district lists no services for keep the older
 *     rule — shown while nobody at all serves them.) The ones the district names THEM as case manager for are
 *     pre-ticked; the rest are not, because case manager is not the same role
 *     as service provider and Speddy will not assume. An unticked student is
 *     never "not yours" — guessing would put a student on the wrong caseload,
 *     which is worse than asking.
 *   * Students they already serve where the roster holds something newer.
 *     Blanks the roster can FILL are pre-ticked — accepting only adds. A value
 *     that DISAGREES with theirs is never pre-ticked: it would overwrite
 *     something they typed, so it stays their call.
 *
 * Claiming also brings the district's data along (SPE-575): the caller's
 * role's service minutes, accommodations, testing accommodations, and their
 * discipline's goals — summarized on each claim row so the provider sees what
 * they are taking. List offers on existing students only ever APPEND entries
 * they lack; nothing of theirs is removed or replaced.
 */

interface OffersResponse {
  plan: ClaimPlan;
  hasOffers: boolean;
}

const fullName = (first: string | null, last: string | null, fallback: string) =>
  [first, last].filter(Boolean).join(' ').trim() || fallback;

function ChangeRow({
  offer,
  change,
  checked,
  onToggle,
}: {
  offer: RosterUpdateOffer;
  change: RosterUpdateOffer['changes'][number];
  checked: boolean;
  onToggle: () => void;
}) {
  const conflict = change.kind === 'conflict';
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
        conflict ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5"
        aria-label={`${change.label} for ${offer.initials}`}
      />
      <span className="text-slate-700">
        <span className="font-medium text-slate-900">{change.label}</span>
        {conflict ? (
          <>
            {' '}
            — you have <span className="font-medium">{change.current}</span>, the district says{' '}
            <span className="font-medium">{change.roster}</span>
          </>
        ) : (
          <>
            {' '}
            — you have none; the district says <span className="font-medium">{change.roster}</span>
          </>
        )}
      </span>
    </label>
  );
}

export default function RosterClaimBanner() {
  const [plan, setPlan] = useState<ClaimPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [claimIds, setClaimIds] = useState<Set<string>>(new Set());
  const [accepted, setAccepted] = useState<Map<string, Set<RosterFieldKey>>>(new Map());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/students/roster', { cache: 'no-store' });
      if (!res.ok) return; // Silent: this is an extra, never the reason a page fails.
      const body: unknown = await res.json();
      const nextPlan = (body as Partial<OffersResponse> | null)?.plan;
      // Check the SHAPE before storing it, not just that a plan came back.
      // Everything below this line runs inside the try, so a malformed body
      // would be swallowed — but rendering happens outside it, and a plan in
      // state without its arrays takes the whole page down. A banner nobody
      // sees is the acceptable failure here; a broken Students page is not.
      if (
        !nextPlan?.counts ||
        !Array.isArray(nextPlan.claimable) ||
        !Array.isArray(nextPlan.updates) ||
        !nextPlan.updates.every((u) => Array.isArray(u?.changes)) ||
        // The SPE-575 list fields render unguarded below — a claimable entry
        // without them (an older cached response) must fail the shape check
        // here, not the render.
        !nextPlan.claimable.every(
          (c) =>
            Array.isArray(c?.goals) &&
            Array.isArray(c?.accommodations) &&
            Array.isArray(c?.testingAccommodations),
        )
      ) {
        return;
      }
      setPlan(nextPlan);
      // Pre-select the students the district's own roster names this provider
      // as case manager for. Still a suggestion — case manager is not the same
      // role as service provider, so the rest are left for them to pick, never
      // marked "not yours".
      setClaimIds(new Set(nextPlan.claimable.filter((c) => c.suggested).map((c) => c.childId)));
      // Pre-tick the safe fills only. A conflict is a decision, not a default.
      const next = new Map<string, Set<RosterFieldKey>>();
      for (const update of nextPlan.updates) {
        const fills = update.changes.filter((c) => c.kind === 'fill').map((c) => c.field);
        if (fills.length > 0) next.set(update.studentId, new Set(fills));
      }
      setAccepted(next);
    } catch {
      /* An offer the provider never sees is better than a broken page. */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleClaim = (childId: string) =>
    setClaimIds((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId);
      else next.add(childId);
      return next;
    });

  const toggleField = (studentId: string, field: RosterFieldKey) =>
    setAccepted((prev) => {
      const next = new Map(prev);
      const fields = new Set(next.get(studentId) ?? []);
      if (fields.has(field)) fields.delete(field);
      else fields.add(field);
      if (fields.size === 0) next.delete(studentId);
      else next.set(studentId, fields);
      return next;
    });

  const selectedCount =
    claimIds.size + [...accepted.values()].reduce((sum, fields) => sum + fields.size, 0);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/students/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          claimChildIds: [...claimIds],
          acceptChanges: [...accepted.entries()].map(([studentId, fields]) => ({
            studentId,
            fields: [...fields],
          })),
        }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          typeof (body as { error?: unknown })?.error === 'string'
            ? (body as { error: string }).error
            : 'That could not be saved. Reload the page and try again.',
        );
        return;
      }
      // Coerced, not trusted: a missing number would otherwise render as
      // "undefined student(s) added", and a refusal count that arrives as a
      // string would never pass `> 0` and would go unsaid.
      const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      const result = (body ?? {}) as Record<string, unknown>;
      const claimed = count(result.claimed);
      const updatedFields = count(result.updatedFields);

      // Every refusal gets its OWN sentence, because every one has a different
      // remedy. Folding them together is how a provider ends up hunting for a
      // colleague who took a student nobody took.
      const notes: string[] = [];
      if (count(result.takenBySomeoneElse) > 0) {
        notes.push(
          `${count(result.takenBySomeoneElse)} were already picked up by someone else — nothing` +
            ' changed for them.',
        );
      }
      if (count(result.outOfScope) > 0) {
        notes.push(
          `${count(result.outOfScope)} are no longer on the roster at your school, so they were` +
            " not added — refresh to see what's there now.",
        );
      }
      if (count(result.duplicateInitials) > 0) {
        notes.push(
          `${count(result.duplicateInitials)} could not be added because you already have a` +
            ' student with the same initials in that grade at that school — change the initials on' +
            ' your existing student, then claim again.',
        );
      }
      if (count(result.skippedFields) > 0) {
        // Silence here would be the worst kind: they ticked it, so they believe
        // it saved. It did not.
        notes.push(
          `${count(result.skippedFields)} detail(s) were not applied — the district's information` +
            ' had already changed, or it clashed with another of your students.',
        );
      }
      if (count(result.enrichFailures) > 0) {
        notes.push(
          `${count(result.enrichFailures)} student(s) were added but their district details` +
            " (minutes, goals, accommodations) didn't all save — they'll be offered again on" +
            ' this banner.',
        );
      }

      setDone(
        [`${claimed} student(s) added to your caseload, ${updatedFields} detail(s) updated.`, ...notes].join(
          ' ',
        ),
      );
      setOpen(false);
      setClaimIds(new Set());
      setPlan(null);
      // Deliberately NOT reloading here. The page's student list IS now stale,
      // but reloading would destroy this message before anyone read it — and
      // the refusals above are the outcomes a provider cannot find out any
      // other way: the student simply is not there, with no reason given. The
      // button below reloads on their say-so.
    } catch {
      setError('Could not reach Speddy. Reload the page — it shows what actually changed.');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <span>{done}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
        >
          Refresh your list
        </button>
      </div>
    );
  }

  if (!plan || dismissed) return null;
  const { claimable, updates, counts } = plan;
  /**
   * Does the roster carry case-manager data at all? It does not before the
   * district's first upload with it, nor if their names are spelled
   * differently there — and in those cases "your district doesn't list you"
   * would be a claim we cannot make from an empty column.
   */
  const knowsCaseManagers = claimable.some((c) => c.caseManager);
  if (counts.claimable === 0 && counts.updates === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-sky-900">
            {counts.claimable > 0 && `${counts.claimable} student(s) at your school to claim`}
            {counts.claimable > 0 && counts.updates > 0 && ' · '}
            {counts.updates > 0 && `${counts.updates} of your students have updated information`}
          </p>
          <p className="mt-0.5 text-xs text-sky-800/80">
            Your district put its student roster into Speddy. Nothing is added to your caseload and
            nothing of yours changes until you choose it below.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md bg-sky-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800"
          >
            {open ? 'Hide' : 'Review'}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-800 transition-colors hover:bg-sky-100"
          >
            Not now
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-sky-200 px-4 py-3">
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {claimable.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-900">
                On your district&apos;s roster, with services for you to pick up
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {counts.suggested > 0 ? (
                  <>
                    The {counts.suggested} your district lists you as case manager for are ticked
                    already. Check them, and tick anyone else you serve — case manager isn&apos;t
                    the same as service provider, so your students may not all be marked.
                  </>
                ) : knowsCaseManagers ? (
                  <>
                    Your district doesn&apos;t list you as case manager for any of these, so none
                    are ticked. Tick the students you serve — you may well serve some of them.
                  </>
                ) : (
                  // No case-manager data at all: before the district's next
                  // upload, or when their names are spelled differently there.
                  // Saying "your district doesn't list you" would be a claim we
                  // cannot make from an empty column.
                  <>
                    Speddy doesn&apos;t know which of these are yours, so none are ticked. Tick the
                    students you serve.
                  </>
                )}
              </p>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {claimable.map((c) => {
                  // What claiming brings along, so nobody takes a student blind.
                  const includes: string[] = [];
                  if (c.minutesProposal) {
                    includes.push(
                      `${c.minutesProposal.sessionsPerWeek}×${c.minutesProposal.minutesPerSession} min/week`,
                    );
                  }
                  const plural = (n: number, noun: string) =>
                    `${n} ${noun}${n === 1 ? '' : 's'}`;
                  if (c.goals.length > 0) includes.push(plural(c.goals.length, 'goal'));
                  if (c.accommodations.length > 0) {
                    includes.push(plural(c.accommodations.length, 'accommodation'));
                  }
                  if (c.testingAccommodations.length > 0) {
                    includes.push(`${plural(c.testingAccommodations.length, 'testing accommodation')}`);
                  }
                  return (
                    <label
                      key={c.childId}
                      className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={claimIds.has(c.childId)}
                        onChange={() => toggleClaim(c.childId)}
                      />
                      <span className="text-slate-700">
                        <span className="font-medium text-slate-900">
                          {fullName(c.firstName, c.lastName, c.initials)}
                        </span>
                        {c.gradeLevel ? ` · grade ${c.gradeLevel}` : ''}
                        {c.suggested ? (
                          <>
                            <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                              you&apos;re case manager
                            </span>
                            {/*
                             * SPE-583. A ticked row whose name Speddy FOLDED
                             * ("Antoinette Bentley" for a Toni) keeps showing
                             * the district's own wording. It is the one kind
                             * of tick a provider might need to overrule, and
                             * they cannot if the name it came from is hidden.
                             */}
                            {c.suggestedMatch === 'nickname' && c.caseManager ? (
                              <span className="ml-1.5 text-slate-400">
                                · listed as {c.caseManager}
                              </span>
                            ) : null}
                          </>
                        ) : c.caseManager ? (
                          // SPE-584: label whose name this is — a speech provider
                          // claiming a student case-managed by resource shouldn't
                          // read the bare name as "someone else's student".
                          <span className="ml-1.5 text-slate-400">· Case Manager: {c.caseManager}</span>
                        ) : null}
                        {includes.length > 0 && (
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            comes with {includes.join(' · ')}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {updates.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Your students, where the district has newer information
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Blanks are ticked for you. Anything that disagrees with what you entered is left for
                you to decide. Goals and accommodations only ever add the district&apos;s entries —
                nothing of yours is removed or rewritten.
              </p>
              <div className="mt-1.5 space-y-2">
                {updates.map((u) => (
                  <div key={u.studentId} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                    <p className="text-xs font-medium text-slate-900">
                      {u.initials}
                      {u.gradeLevel ? ` · grade ${u.gradeLevel}` : ''}
                    </p>
                    <div className="mt-1 space-y-1">
                      {u.changes.map((change) => (
                        <ChangeRow
                          key={change.field}
                          offer={u}
                          change={change}
                          checked={accepted.get(u.studentId)?.has(change.field) ?? false}
                          onToggle={() => toggleField(u.studentId, change.field)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || selectedCount === 0}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Apply ${selectedCount} selected`}
            </button>
            <span className="text-xs text-slate-500">
              Nothing else on your caseload changes.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
