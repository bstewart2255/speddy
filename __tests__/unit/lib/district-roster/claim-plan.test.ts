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
  dateOfBirth: null,
  upcomingIepDate: '2027-02-09',
  upcomingTriennialDate: '2029-02-09',
  caseManager: 'Cynthia Reyes',
  accommodations: [],
  testingAccommodations: [],
  districtServices: null,
  districtGoals: null,
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
  dateOfBirth: null,
  upcomingIepDate: '2027-02-09',
  upcomingTriennialDate: '2029-02-09',
  sessionsPerWeek: null,
  minutesPerSession: null,
  accommodations: [],
  testingAccommodations: [],
  iepGoals: [],
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

  it('offers no goal changes for a child the district uploaded no goals for', () => {
    // The pre-SPE-575 rule was "goals are never touched, the roster holds
    // none". Goals now ride the roster when the district uploads its Goals
    // report — but a child WITHOUT district goals must still produce zero
    // goal offers, and a provider's own goals are still never subtracted
    // (offers only ever append; see the SPE-575 suite below).
    const result = plan({
      myRole: 'resource',
      rosterChildren: [rosterChild({ caseloadCount: 1, gradeLevel: '2', districtGoals: null })],
      myStudents: [myStudent({ gradeLevel: '2', iepGoals: ['A goal the provider wrote'] })],
    });

    expect(result.updates.flatMap((u) => u.changes.map((c) => c.field))).not.toContain('iepGoals');
  });
});

// ---------------------------------------------------------------------------
// SPE-575: minutes, accommodations, testing accommodations, goals
// ---------------------------------------------------------------------------

const speechLine = (weeklyMinutes: number, code = '415', name = 'Language and Speech') => ({
  code,
  name,
  minutes: weeklyMinutes,
  frequency: 'weekly' as const,
  weeklyMinutes,
});

const districtGoals = {
  iepDate: '2026-01-22',
  goals: [
    { text: 'Will produce /r/ in conversation', areaOfNeed: 'Speech/Language', goalType: '', personResponsible: 'SLP' },
    { text: 'Will read 90 words per minute', areaOfNeed: 'Academic', goalType: '', personResponsible: 'Resource Specialist' },
  ],
};

describe('planRosterClaims — SPE-575 district data', () => {
  it('proposes the claiming role its own services, summed across split lines', () => {
    const result = plan({
      myRole: 'speech',
      rosterChildren: [
        rosterChild({
          districtServices: [speechLine(30), speechLine(21), speechLine(240, '330', 'Specialized Academic Instruction')],
          districtGoals,
          accommodations: ['Extended time'],
          testingAccommodations: ['Masking (embedded)'],
        }),
      ],
    });

    const offer = result.claimable[0];
    // 51 weekly speech minutes → ceil(51/30) thirty-minute sessions; the SAI
    // line belongs to resource and is ignored.
    expect(offer.minutesProposal).toEqual({
      weeklyMinutes: 51,
      sessionsPerWeek: 2,
      minutesPerSession: 30,
      serviceNames: ['Language and Speech'],
    });
    // Only the speech goal routes to an SLP.
    expect(offer.goals).toEqual(['Will produce /r/ in conversation']);
    expect(offer.goalsIepDate).toBe('2026-01-22');
    expect(offer.accommodations).toEqual(['Extended time']);
    expect(offer.testingAccommodations).toEqual(['Masking (embedded)']);
  });

  it('keeps a secondary resource mandate as one weekly bucket', () => {
    const result = plan({
      myRole: 'resource',
      schoolLevels: { 'sch-rodeo': { school_type: 'High School', grade_span_low: '9' } },
      rosterChildren: [
        rosterChild({ districtServices: [speechLine(285, '330', 'Specialized Academic Instruction')] }),
      ],
    });
    expect(result.claimable[0].minutesProposal).toMatchObject({
      sessionsPerWeek: 1,
      minutesPerSession: 285,
    });
  });

  it('proposes nothing for a role with no service of its own', () => {
    const result = plan({
      myRole: 'specialist',
      rosterChildren: [rosterChild({ districtServices: [speechLine(30)] })],
    });
    expect(result.claimable[0].minutesProposal).toBeNull();
    // But a specialist imports every goal, matching the per-provider rule.
    const withGoals = plan({
      myRole: 'specialist',
      rosterChildren: [rosterChild({ districtGoals })],
    });
    expect(withGoals.claimable[0].goals).toHaveLength(2);
  });

  describe('updates on students the provider already has', () => {
    it('offers minutes as a fill when the provider has none', () => {
      const result = plan({
        myRole: 'speech',
        rosterChildren: [rosterChild({ caseloadCount: 1, districtServices: [speechLine(30)] })],
        myStudents: [myStudent()],
      });
      const change = result.updates[0].changes.find((c) => c.field === 'serviceMinutes')!;
      expect(change.kind).toBe('fill');
      expect(change.split).toEqual({ sessionsPerWeek: 1, minutesPerSession: 30 });
      expect(change.roster).toContain('30 min/week of Language and Speech');
    });

    it('does not re-flag the split acceptance itself wrote for a rounded-up mandate', () => {
      // A 51 min/week mandate stores as ceil(51/30) = 2×30 = 60. Comparing the
      // stored 60 against the raw 51 would conflict forever; the stored split
      // matching the proposal's own split is the fixed point.
      const result = plan({
        myRole: 'speech',
        rosterChildren: [
          rosterChild({ caseloadCount: 1, districtServices: [speechLine(30), speechLine(21)] }),
        ],
        myStudents: [myStudent({ sessionsPerWeek: 2, minutesPerSession: 30 })],
      });
      expect(result.updates).toHaveLength(0);
    });

    it('does not flag a different split of the SAME weekly total', () => {
      // The provider schedules 2×15; the district mandate is 30/week. Equal.
      const result = plan({
        myRole: 'speech',
        rosterChildren: [rosterChild({ caseloadCount: 1, districtServices: [speechLine(30)] })],
        myStudents: [myStudent({ sessionsPerWeek: 2, minutesPerSession: 15 })],
      });
      expect(result.updates).toHaveLength(0);
    });

    it('flags a different weekly total as a conflict, never pre-applied', () => {
      const result = plan({
        myRole: 'speech',
        rosterChildren: [rosterChild({ caseloadCount: 1, districtServices: [speechLine(60)] })],
        myStudents: [myStudent({ sessionsPerWeek: 1, minutesPerSession: 30 })],
      });
      const change = result.updates[0].changes.find((c) => c.field === 'serviceMinutes')!;
      expect(change.kind).toBe('conflict');
      expect(change.current).toContain('30 min/week');
      expect(change.roster).toContain('60 min/week');
    });

    it('appends missing list entries, keeping the provider\'s own first', () => {
      const result = plan({
        myRole: 'speech',
        rosterChildren: [
          rosterChild({
            caseloadCount: 1,
            accommodations: ['Extended time', 'Preferential seating'],
          }),
        ],
        myStudents: [myStudent({ accommodations: ['Preferential seating', 'My own note'] })],
      });
      const change = result.updates[0].changes.find((c) => c.field === 'accommodations')!;
      // Non-empty list → the provider decides; never a pre-ticked fill.
      expect(change.kind).toBe('conflict');
      expect(change.values).toEqual(['Preferential seating', 'My own note', 'Extended time']);
      expect(change.roster).toContain('adds 1 accommodation');
    });

    it('fills goals with the role\'s subset and carries the goal vintage', () => {
      const result = plan({
        myRole: 'speech',
        rosterChildren: [rosterChild({ caseloadCount: 1, districtGoals })],
        myStudents: [myStudent()],
      });
      const change = result.updates[0].changes.find((c) => c.field === 'iepGoals')!;
      expect(change.kind).toBe('fill');
      expect(change.values).toEqual(['Will produce /r/ in conversation']);
      expect(change.goalsIepDate).toBe('2026-01-22');
    });

    it('offers nothing when the provider already holds every district entry', () => {
      const result = plan({
        myRole: 'speech',
        rosterChildren: [
          rosterChild({ caseloadCount: 1, accommodations: ['Extended  time'] }),
        ],
        // Whitespace differences are not additions.
        myStudents: [myStudent({ accommodations: ['Extended time'] })],
      });
      expect(result.updates).toHaveLength(0);
    });
  });
});
