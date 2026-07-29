/**
 * SPE-348: the client-side link decision.
 *
 * This one function decides whether an imported student becomes a second
 * caseload row on an EXISTING child or a brand-new child — the highest-stakes
 * decision in the child-identity plan, and the only place the importer's answer
 * turns into a write. A regression here silently links (or fails to link)
 * children, so the three answers are pinned explicitly.
 */

import { confirmedChildIdFor } from '@/app/components/students/review/student-import-review';
import type { ChildMatchOffer } from '@/lib/types/student-import';

const offer: ChildMatchOffer = {
  childId: 'child-1',
  reason: 'name-grade',
  gradeLevel: '5',
  districtStudentId: null,
  providerName: 'Emily Chen',
  providerRole: 'speech',
};

describe('confirmedChildIdFor (SPE-348)', () => {
  it('claims the child only on an explicit "same child"', () => {
    expect(confirmedChildIdFor({ childMatch: offer }, 'link')).toBe('child-1');
  });

  it('claims nothing when declined', () => {
    expect(confirmedChildIdFor({ childMatch: offer }, 'separate')).toBeUndefined();
  });

  it('claims nothing when the offer is left unanswered', () => {
    expect(confirmedChildIdFor({ childMatch: offer }, undefined)).toBeUndefined();
  });

  it('claims nothing when there was no offer at all — even if a choice leaked in', () => {
    expect(confirmedChildIdFor({ childMatch: undefined }, 'link')).toBeUndefined();
    expect(confirmedChildIdFor({ childMatch: undefined }, undefined)).toBeUndefined();
  });
});
