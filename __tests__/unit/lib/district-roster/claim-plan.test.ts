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
  servedRoles: [],
  ...over,
});

/** A served child the loader invariant would produce: count and roles agree. */
const servedBy = (...roles: string[]): Partial<RosterChild> => ({
  caseloadCount: roles.length,
  servedRoles: [...new Set(roles)],
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

// ---------------------------------------------------------------------------
// Stored-JSON validators (drop, never crash)
// ---------------------------------------------------------------------------

import { parseDistrictGoals, parseDistrictServices, proposeServiceMinutes } from '@/lib/district-roster/claim-plan';

describe('parseDistrictServices / parseDistrictGoals', () => {
  it('drops malformed service payloads instead of crashing an offer', () => {
    expect(parseDistrictServices(null)).toBeNull();
    expect(parseDistrictServices({ not: 'an array' })).toBeNull();
    expect(parseDistrictServices([{ code: '415' }])).toBeNull(); // no weeklyMinutes
    // A bad line is dropped; a good one beside it survives.
    expect(
      parseDistrictServices([{ code: '415', weeklyMinutes: 30 }, 'garbage']),
    ).toEqual([
      { code: '415', name: 'Service 415', minutes: 0, frequency: 'weekly', weeklyMinutes: 30 },
    ]);
  });

  it('drops malformed goal payloads instead of crashing an offer', () => {
    expect(parseDistrictGoals(null)).toBeNull();
    expect(parseDistrictGoals([])).toBeNull();
    expect(parseDistrictGoals({ goals: 'nope' })).toBeNull();
    expect(parseDistrictGoals({ iepDate: '2026-01-15', goals: [{ text: '   ' }] })).toBeNull();
    expect(
      parseDistrictGoals({ iepDate: '2026-01-15', goals: [{ text: 'A real goal about reading.' }] }),
    ).toEqual({
      iepDate: '2026-01-15',
      goals: [{ text: 'A real goal about reading.', areaOfNeed: '', goalType: '', personResponsible: '' }],
    });
  });

  it('refuses a fractional weekly total from untyped stored JSON', () => {
    const proposal = proposeServiceMinutes(
      [{ code: '415', name: 'Language and Speech', minutes: 0, frequency: 'weekly', weeklyMinutes: 21.5 }],
      'speech',
      null,
    );
    expect(proposal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SPE-577: role-based claiming — a child is claimable per SERVICE, not once
// ---------------------------------------------------------------------------

describe('role-based claiming (SPE-577)', () => {
  // Brooklynn Charles, the real JSUSD test case: academic across two lines
  // (900 + 940 min/week — placement-scale), speech 30/wk + 21/wk, OT 30/wk.
  const brooklynn = (over: Partial<RosterChild> = {}) =>
    rosterChild({
      id: 'child-bk',
      initials: 'BC',
      firstName: 'Brooklynn',
      lastName: 'Charles',
      gradeLevel: '1',
      accommodations: ['Preferential seating', 'Extra time'],
      districtServices: [
        speechLine(900, '330', 'Specialized Academic Instruction'),
        speechLine(940, '330', 'Specialized Academic Instruction'),
        speechLine(30, '415', 'Language and Speech'),
        speechLine(21, '415', 'Language and Speech'),
        speechLine(30, '450', 'Occupational therapy'),
      ],
      ...over,
    });

  const planFor = (role: string, over: Partial<RosterChild> = {}) =>
    planRosterClaims({ rosterChildren: [brooklynn(over)], myStudents: [], myRole: role });

  it('shows a three-service student to all three disciplines at once', () => {
    for (const role of ['resource', 'speech', 'ot']) {
      const result = planFor(role);
      expect(result.counts.claimable).toBe(1);
      expect(result.claimable[0].accommodations).toEqual([
        'Preferential seating',
        'Extra time',
      ]);
    }
  });

  it('keeps the offer role-specific: minutes for MY service only', () => {
    // Speech: 30 + 21 = 51/week → written as 2×30. OT: 1×30.
    expect(planFor('speech').claimable[0].minutesProposal).toMatchObject({
      weeklyMinutes: 51,
      sessionsPerWeek: 2,
      minutesPerSession: 30,
    });
    expect(planFor('ot').claimable[0].minutesProposal).toMatchObject({
      weeklyMinutes: 30,
      sessionsPerWeek: 1,
      minutesPerSession: 30,
    });
    // 1,840 academic min/week would be 62 sessions — beyond anything Speddy
    // will propose, so the resource offer carries NO minutes pre-fill (the
    // claim itself still stands).
    expect(planFor('resource').claimable[0].minutesProposal).toBeNull();
  });

  it('a speech claim closes the child to speech but NOT to OT or resource', () => {
    expect(planFor('speech', servedBy('speech')).counts.claimable).toBe(0);
    expect(planFor('ot', servedBy('speech')).counts.claimable).toBe(1);
    expect(planFor('resource', servedBy('speech')).counts.claimable).toBe(1);
  });

  it('two disciplines served leaves only the third open', () => {
    const taken = servedBy('speech', 'ot');
    expect(planFor('resource', taken).counts.claimable).toBe(1);
    expect(planFor('speech', taken).counts.claimable).toBe(0);
    expect(planFor('ot', taken).counts.claimable).toBe(0);
  });

  it('counseling and psychologist block each other — one discipline, two titles', () => {
    const withCounseling = brooklynn({
      districtServices: [speechLine(30, '510', 'Individual Counseling')],
      ...servedBy('counseling'),
    });
    for (const role of ['counseling', 'psychologist']) {
      const result = planRosterClaims({
        rosterChildren: [withCounseling],
        myStudents: [],
        myRole: role,
      });
      expect(result.counts.claimable).toBe(0);
    }
  });

  it('a generalist on the caseload closes the child to every discipline', () => {
    for (const role of ['resource', 'speech', 'ot']) {
      expect(planFor(role, servedBy('specialist')).counts.claimable).toBe(0);
    }
  });

  it('generalists keep the original rule: only a nobody-serves child is theirs', () => {
    expect(planFor('specialist').counts.claimable).toBe(1);
    expect(planFor('specialist', servedBy('speech')).counts.claimable).toBe(0);
  });

  it('never offers a student whose services do not include my discipline', () => {
    // Speech-only student: not on the OT or resource lists at all.
    const speechOnly = { districtServices: [speechLine(30)] };
    expect(planFor('speech', speechOnly).counts.claimable).toBe(1);
    expect(planFor('ot', speechOnly).counts.claimable).toBe(0);
    expect(planFor('resource', speechOnly).counts.claimable).toBe(0);
  });

  it('services no discipline delivers fall back to the everyone-sees rule', () => {
    // SEIS lists plenty Speddy cannot route — adapted PE, behavior support,
    // vision services. A child whose services are ALL unmapped must not
    // vanish from every discipline's list.
    const unmappedOnly = { districtServices: [speechLine(60, '425', 'Adapted PE')] };
    expect(planFor('resource', unmappedOnly).counts.claimable).toBe(1);
    expect(planFor('speech', unmappedOnly).counts.claimable).toBe(1);
    // Any caseload hides them again — the original rule end to end.
    expect(planFor('speech', { ...unmappedOnly, ...servedBy('ot') }).counts.claimable).toBe(0);
    // And no minutes proposal: those minutes belong to no Speddy role.
    expect(planFor('resource', unmappedOnly).claimable[0].minutesProposal).toBeNull();
  });

  it('a child with NO services data keeps the original rule for every role', () => {
    const noData = { districtServices: null };
    expect(planFor('speech', noData).counts.claimable).toBe(1);
    expect(planFor('ot', noData).counts.claimable).toBe(1);
    expect(planFor('speech', { districtServices: null, ...servedBy('ot') }).counts.claimable).toBe(0);
  });

  it('an unreadable caseload role blocks everyone — it can never open a child', () => {
    for (const role of ['resource', 'speech', 'ot', 'specialist']) {
      expect(planFor(role, servedBy('unknown')).counts.claimable).toBe(0);
    }
  });

  it('never re-offers a child already on MY caseload, whatever the roles say', () => {
    const result = planRosterClaims({
      rosterChildren: [brooklynn(servedBy('speech'))],
      myStudents: [myStudent({ childId: 'child-bk' })],
      myRole: 'ot',
    });
    expect(result.counts.claimable).toBe(0);
  });
});
