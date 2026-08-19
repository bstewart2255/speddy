/**
 * SPE-447 slice 2 · what a provider is offered from their district's roster.
 *
 * The rules that matter here are the ones that protect what the provider
 * already typed: a blank on the roster never proposes erasing anything, a
 * disagreement is never quietly applied, and a student someone else serves is
 * never offered as claimable.
 *
 * All names are fictional.
 */

import {
  hasRosterOffers,
  planRosterClaims,
  type ClaimPlanInput,
  type ProviderStudent,
  type RosterChild,
} from '@/lib/district-roster/claim-plan';

const rosterChild = (over: Partial<RosterChild> = {}): RosterChild => ({
  id: 'child-1',
  initials: 'AA',
  firstName: 'Ana',
  lastName: 'Alvarez',
  gradeLevel: '1',
  schoolId: 'sch-rodeo',
  districtStudentId: '100001',
  upcomingIepDate: '2027-02-09',
  upcomingTriennialDate: '2029-02-09',
  caseManager: 'Cynthia Reyes',
  caseloadCount: 0,
  ...over,
});

const myStudent = (over: Partial<ProviderStudent> = {}): ProviderStudent => ({
  studentId: 'stu-1',
  childId: 'child-1',
  initials: 'AA',
  firstName: 'Ana',
  lastName: 'Alvarez',
  gradeLevel: '1',
  districtStudentId: '100001',
  upcomingIepDate: '2027-02-09',
  upcomingTriennialDate: '2029-02-09',
  ...over,
});

const plan = (over: Partial<ClaimPlanInput> = {}) =>
  planRosterClaims({ rosterChildren: [rosterChild()], myStudents: [], ...over });

describe('planRosterClaims', () => {
  describe('students to claim', () => {
    it('offers a roster student nobody serves', () => {
      const result = plan();

      expect(result.counts.claimable).toBe(1);
      expect(result.claimable[0]).toMatchObject({
        childId: 'child-1',
        firstName: 'Ana',
        gradeLevel: '1',
        districtStudentId: '100001',
      });
    });

    it('does not offer a student another provider already serves', () => {
      const result = plan({ rosterChildren: [rosterChild({ caseloadCount: 1 })] });
      expect(result.counts.claimable).toBe(0);
    });

    it('does not offer a student the provider already has', () => {
      const result = plan({
        rosterChildren: [rosterChild({ caseloadCount: 1 })],
        myStudents: [myStudent()],
      });
      expect(result.counts.claimable).toBe(0);
    });
  });

  describe('the case-manager hint', () => {
    it('suggests the students the district says this provider manages', () => {
      const result = planRosterClaims({
        rosterChildren: [rosterChild()],
        myStudents: [],
        myName: 'Cynthia Reyes',
      });

      expect(result.counts.suggested).toBe(1);
      expect(result.claimable[0].suggested).toBe(true);
      // Carried verbatim so the screen can say who, when it isn't them.
      expect(result.claimable[0].caseManager).toBe('Cynthia Reyes');
    });

    it("matches across an apostrophe — SEIS writes O'Malley as OMalley", () => {
      for (const cm of ['Charli OMalley', "Charli O'Malley", 'Charli O\u2019Malley']) {
        expect(
          planRosterClaims({
            rosterChildren: [rosterChild({ caseManager: cm })],
            myStudents: [],
            myName: "Charli O'Malley",
          }).claimable[0].suggested,
        ).toBe(true);
      }
    });

    it('ignores case, punctuation and spacing', () => {
      const result = planRosterClaims({
        rosterChildren: [rosterChild({ caseManager: '  cynthia   reyes ' })],
        myStudents: [],
        myName: 'Cynthia Reyes',
      });
      expect(result.claimable[0].suggested).toBe(true);
    });

    it('still OFFERS a student managed by someone else — just unticked', () => {
      // Case manager is not the same role as service provider: an SLP serves
      // students she does not manage, so a non-match must never hide anyone.
      const result = planRosterClaims({
        rosterChildren: [rosterChild({ caseManager: 'Someone Else' })],
        myStudents: [],
        myName: 'Cynthia Reyes',
      });

      expect(result.counts.claimable).toBe(1);
      expect(result.counts.suggested).toBe(0);
      expect(result.claimable[0].suggested).toBe(false);
    });

    it('suggests nothing when either side has no name, rather than guessing', () => {
      expect(
        planRosterClaims({ rosterChildren: [rosterChild({ caseManager: null })], myStudents: [], myName: 'Cynthia Reyes' })
          .claimable[0].suggested,
      ).toBe(false);
      expect(
        planRosterClaims({ rosterChildren: [rosterChild()], myStudents: [], myName: null }).claimable[0]
          .suggested,
      ).toBe(false);
      expect(
        planRosterClaims({ rosterChildren: [rosterChild({ caseManager: '' })], myStudents: [], myName: '' })
          .claimable[0].suggested,
      ).toBe(false);
    });

    it('does not match on a partial or reversed name', () => {
      for (const cm of ['Cynthia', 'Reyes', 'Reyes Cynthia', 'Cynthia Reyes-Smith']) {
        expect(
          planRosterClaims({ rosterChildren: [rosterChild({ caseManager: cm })], myStudents: [], myName: 'Cynthia Reyes' })
            .claimable[0].suggested,
        ).toBe(false);
      }
    });
  });

  describe('updates to students they already serve', () => {
    it('finds nothing when the roster agrees with them', () => {
      const result = plan({
        rosterChildren: [rosterChild({ caseloadCount: 1 })],
        myStudents: [myStudent()],
      });

      expect(result.counts.updates).toBe(0);
      expect(hasRosterOffers(result)).toBe(false);
    });

    it('offers a blank they have as a safe fill', () => {
      const result = plan({
        rosterChildren: [rosterChild({ caseloadCount: 1 })],
        myStudents: [myStudent({ upcomingTriennialDate: null })],
      });

      expect(result.counts).toMatchObject({ updates: 1, fills: 1, conflicts: 0 });
      expect(result.updates[0].changes[0]).toEqual({
        field: 'upcomingTriennialDate',
        label: 'Triennial date',
        current: null,
        roster: '2029-02-09',
        kind: 'fill',
      });
    });

    it('marks a real disagreement as a conflict, keeping both values', () => {
      const result = plan({
        rosterChildren: [rosterChild({ caseloadCount: 1, gradeLevel: '2' })],
        myStudents: [myStudent()],
      });

      expect(result.counts).toMatchObject({ fills: 0, conflicts: 1 });
      expect(result.updates[0].changes[0]).toEqual({
        field: 'gradeLevel',
        label: 'Grade',
        current: '1',
        roster: '2',
        kind: 'conflict',
      });
    });

    it('never proposes erasing something the provider entered', () => {
      // The roster has no triennial for this student; theirs must survive.
      const result = plan({
        rosterChildren: [rosterChild({ caseloadCount: 1, upcomingTriennialDate: null })],
        myStudents: [myStudent({ upcomingTriennialDate: '2030-01-01' })],
      });

      expect(result.counts.updates).toBe(0);
    });

    it('says nothing about a student of theirs the roster does not list', () => {
      const result = plan({
        rosterChildren: [],
        myStudents: [myStudent({ upcomingIepDate: null })],
      });

      expect(result.counts.updates).toBe(0);
      expect(hasRosterOffers(result)).toBe(false);
    });

    it('ignores a legacy caseload row with no child link', () => {
      const result = plan({
        rosterChildren: [rosterChild({ caseloadCount: 1 })],
        myStudents: [myStudent({ childId: null, gradeLevel: '9' })],
      });

      expect(result.counts.updates).toBe(0);
    });

    it('separates fills from conflicts on one student', () => {
      const result = plan({
        rosterChildren: [rosterChild({ caseloadCount: 1, gradeLevel: '2' })],
        myStudents: [myStudent({ lastName: null, districtStudentId: '999999' })],
      });

      const byKind = result.updates[0].changes.reduce<Record<string, string[]>>((acc, c) => {
        (acc[c.kind] ??= []).push(c.field);
        return acc;
      }, {});
      expect(byKind.fill).toEqual(['lastName']);
      expect(byKind.conflict.sort()).toEqual(['districtStudentId', 'gradeLevel']);
      expect(result.counts).toMatchObject({ fills: 1, conflicts: 2 });
    });
  });

  it('never mentions goals — the roster holds none, so they cannot be touched', () => {
    const result = plan({
      rosterChildren: [rosterChild({ caseloadCount: 1, gradeLevel: '2' })],
      myStudents: [myStudent()],
    });

    expect(JSON.stringify(result)).not.toMatch(/goal/i);
  });
});
