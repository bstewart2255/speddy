/**
 * Provider setup guide derivation (SPE-521): which checklist items appear for
 * each role × school level, and when each counts as done. Pure logic — the
 * real-session RLS behavior (school-wide reads, dismissal persistence) is
 * covered by the sim-district walk, which mocked tests cannot see.
 */

import {
  deriveProviderSetupItems,
  deriveSiteAdminSetupItems,
  isProviderSetupRole,
  type ProviderSetupFacts,
  type SiteAdminSetupFacts,
} from '@/lib/onboarding/setup-guide';

const emptyFacts: ProviderSetupFacts = {
  hasStudents: false,
  hasSiteSchedules: false,
  hasBellSchedules: false,
  hasSpecialActivities: false,
  activitiesMarkedNone: false,
  unscheduledCount: 0,
};

const completeFacts: ProviderSetupFacts = {
  hasStudents: true,
  hasSiteSchedules: true,
  hasBellSchedules: true,
  hasSpecialActivities: true,
  activitiesMarkedNone: false,
  unscheduledCount: 0,
};

function ids(items: ReturnType<typeof deriveProviderSetupItems>) {
  return items.map(item => item.id);
}

describe('isProviderSetupRole', () => {
  it.each([
    'resource',
    'specialist',
    'speech',
    'ot',
    'counseling',
    'psychologist',
    'intervention',
  ])('accepts provider role %s', role => {
    expect(isProviderSetupRole(role)).toBe(true);
  });

  it.each(['sea', 'teacher', 'site_admin', 'district_admin', 'district_tech'])(
    'rejects non-provider role %s',
    role => {
      expect(isProviderSetupRole(role)).toBe(false);
    }
  );

  it('rejects null, undefined and empty', () => {
    expect(isProviderSetupRole(null)).toBe(false);
    expect(isProviderSetupRole(undefined)).toBe(false);
    expect(isProviderSetupRole('')).toBe(false);
  });
});

describe('deriveProviderSetupItems — which items appear', () => {
  it('elementary single-school provider gets the four core items in order', () => {
    const items = deriveProviderSetupItems({
      role: 'resource',
      isSecondary: false,
      worksAtMultipleSchools: false,
      facts: emptyFacts,
    });
    expect(ids(items)).toEqual([
      'students',
      'bell-schedules',
      'special-activities',
      'schedule-sessions',
    ]);
  });

  it('multi-school adds the work-schedule item after students', () => {
    const items = deriveProviderSetupItems({
      role: 'speech',
      isSecondary: false,
      worksAtMultipleSchools: true,
      facts: emptyFacts,
    });
    expect(ids(items)).toEqual([
      'students',
      'work-schedule',
      'bell-schedules',
      'special-activities',
      'schedule-sessions',
    ]);
  });

  it('secondary related service (speech) keeps period grid + scheduling, loses activities', () => {
    const items = deriveProviderSetupItems({
      role: 'speech',
      isSecondary: true,
      worksAtMultipleSchools: false,
      facts: emptyFacts,
    });
    expect(ids(items)).toEqual([
      'students',
      'bell-schedules',
      'schedule-sessions',
    ]);
    expect(items[1].title).toBe("Enter the school's period grid");
  });

  it('secondary resource keeps the period grid but not session scheduling (weekly-bucket service)', () => {
    const items = deriveProviderSetupItems({
      role: 'resource',
      isSecondary: true,
      worksAtMultipleSchools: false,
      facts: emptyFacts,
    });
    expect(ids(items)).toEqual(['students', 'bell-schedules']);
  });

  it.each(['specialist', 'intervention'])(
    'secondary %s loses every scheduling surface — students only',
    role => {
      const items = deriveProviderSetupItems({
        role,
        isSecondary: true,
        worksAtMultipleSchools: false,
        facts: emptyFacts,
      });
      expect(ids(items)).toEqual(['students']);
    }
  );

  it('a padded role string still gets its role-specific items (secondary resource keeps the period grid)', () => {
    const items = deriveProviderSetupItems({
      role: ' resource ',
      isSecondary: true,
      worksAtMultipleSchools: false,
      facts: emptyFacts,
    });
    expect(ids(items)).toEqual(['students', 'bell-schedules']);
  });

  it('marks bell schedules and special activities as shared, others not', () => {
    const items = deriveProviderSetupItems({
      role: 'ot',
      isSecondary: false,
      worksAtMultipleSchools: true,
      facts: emptyFacts,
    });
    const sharedById = Object.fromEntries(
      items.map(item => [item.id, !!item.sharedWith])
    );
    expect(sharedById).toEqual({
      students: false,
      'work-schedule': false,
      'bell-schedules': true,
      'special-activities': true,
      'schedule-sessions': false,
    });
  });
});

describe('deriveProviderSetupItems — when items count as done', () => {
  it('everything todo on empty facts', () => {
    const items = deriveProviderSetupItems({
      role: 'resource',
      isSecondary: false,
      worksAtMultipleSchools: true,
      facts: emptyFacts,
    });
    expect(items.every(item => item.state === 'todo')).toBe(true);
  });

  it('everything done on complete facts', () => {
    const items = deriveProviderSetupItems({
      role: 'resource',
      isSecondary: false,
      worksAtMultipleSchools: true,
      facts: completeFacts,
    });
    expect(items.every(item => item.state === 'done')).toBe(true);
  });

  it('schedule-sessions is NOT done with zero unscheduled but no students (empty caseload)', () => {
    const items = deriveProviderSetupItems({
      role: 'resource',
      isSecondary: false,
      worksAtMultipleSchools: false,
      facts: { ...emptyFacts, unscheduledCount: 0 },
    });
    const schedule = items.find(item => item.id === 'schedule-sessions');
    expect(schedule?.state).toBe('todo');
  });

  it('schedule-sessions is todo while sessions remain unscheduled, and says how many', () => {
    const items = deriveProviderSetupItems({
      role: 'resource',
      isSecondary: false,
      worksAtMultipleSchools: false,
      facts: { ...completeFacts, unscheduledCount: 3 },
    });
    const schedule = items.find(item => item.id === 'schedule-sessions');
    expect(schedule?.state).toBe('todo');
    expect(schedule?.description).toContain('3 sessions still need a spot');
  });

  it('uses singular phrasing for exactly one unscheduled session', () => {
    const items = deriveProviderSetupItems({
      role: 'resource',
      isSecondary: false,
      worksAtMultipleSchools: false,
      facts: { ...completeFacts, unscheduledCount: 1 },
    });
    const schedule = items.find(item => item.id === 'schedule-sessions');
    expect(schedule?.description).toContain('1 session still needs a spot');
  });

  it('special activities complete via the "my teachers have none" escape hatch', () => {
    const items = deriveProviderSetupItems({
      role: 'counseling',
      isSecondary: false,
      worksAtMultipleSchools: false,
      facts: { ...emptyFacts, activitiesMarkedNone: true },
    });
    const activities = items.find(item => item.id === 'special-activities');
    expect(activities?.state).toBe('done');
    expect(activities?.markedNone).toBe(true);
  });

  it('real activity data wins over the escape hatch (markedNone not flagged)', () => {
    const items = deriveProviderSetupItems({
      role: 'counseling',
      isSecondary: false,
      worksAtMultipleSchools: false,
      facts: {
        ...emptyFacts,
        hasSpecialActivities: true,
        activitiesMarkedNone: true,
      },
    });
    const activities = items.find(item => item.id === 'special-activities');
    expect(activities?.state).toBe('done');
    expect(activities?.markedNone).toBe(false);
  });
});

describe('deriveSiteAdminSetupItems (SPE-522)', () => {
  const emptyAdminFacts: SiteAdminSetupFacts = {
    schoolTypePresent: false,
    gradeSpanPresent: false,
    hasTeachers: false,
    hasStaff: false,
    hasBellSchedules: false,
    hasSpecialActivities: false,
    providerCount: 0,
    providersWithStudents: 0,
  };

  const completeAdminFacts: SiteAdminSetupFacts = {
    schoolTypePresent: true,
    gradeSpanPresent: true,
    hasTeachers: true,
    hasStaff: true,
    hasBellSchedules: true,
    hasSpecialActivities: true,
    providerCount: 3,
    providersWithStudents: 3,
  };

  it('empty school: facts and teachers wait on their named blockers, schedule data is actionable', () => {
    const items = deriveSiteAdminSetupItems({
      isSecondary: false,
      facts: emptyAdminFacts,
    });
    expect(items.map(item => [item.id, item.state])).toEqual([
      ['school-facts', 'waiting'],
      ['teachers-staff', 'waiting'],
      ['master-schedule', 'todo'],
      ['caseloads', 'waiting'],
    ]);
    const byId = Object.fromEntries(items.map(item => [item.id, item]));
    expect(byId['school-facts'].waitingOn).toBe('Speddy support');
    expect(byId['teachers-staff'].waitingOn).toBe("the district's SIS sync");
    expect(byId['caseloads'].waitingOn).toBe('the district kickoff');
  });

  it('fully set up elementary school: everything done', () => {
    const items = deriveSiteAdminSetupItems({
      isSecondary: false,
      facts: completeAdminFacts,
    });
    expect(items.every(item => item.state === 'done')).toBe(true);
  });

  it('secondary school: period-grid title, and bells alone complete the schedule item', () => {
    const items = deriveSiteAdminSetupItems({
      isSecondary: true,
      facts: {
        ...completeAdminFacts,
        hasSpecialActivities: false,
      },
    });
    const schedule = items.find(item => item.id === 'master-schedule');
    expect(schedule?.title).toBe("Put the school's period grid in");
    expect(schedule?.state).toBe('done');
  });

  it('elementary needs activities too: bells alone leave the schedule item todo', () => {
    const items = deriveSiteAdminSetupItems({
      isSecondary: false,
      facts: {
        ...completeAdminFacts,
        hasSpecialActivities: false,
      },
    });
    expect(items.find(item => item.id === 'master-schedule')?.state).toBe(
      'todo'
    );
  });

  it('teachers arrived but no staff yet: item becomes actionable and links to the staff page', () => {
    const items = deriveSiteAdminSetupItems({
      isSecondary: false,
      facts: { ...completeAdminFacts, hasStaff: false },
    });
    const lists = items.find(item => item.id === 'teachers-staff');
    expect(lists?.state).toBe('todo');
    expect(lists?.href).toBe('/dashboard/admin/staff');
  });

  it('caseloads wait on providers and report progress counts', () => {
    const items = deriveSiteAdminSetupItems({
      isSecondary: false,
      facts: {
        ...completeAdminFacts,
        providerCount: 3,
        providersWithStudents: 2,
      },
    });
    const caseloads = items.find(item => item.id === 'caseloads');
    expect(caseloads?.state).toBe('waiting');
    expect(caseloads?.waitingOn).toBe('your providers');
    expect(caseloads?.description).toContain('2 of 3 providers');
  });

  it('only the schedule-data item is shared, from the admin side of the partnership', () => {
    const items = deriveSiteAdminSetupItems({
      isSecondary: false,
      facts: emptyAdminFacts,
    });
    expect(
      items.filter(item => item.sharedWith).map(item => item.id)
    ).toEqual(['master-schedule']);
    expect(items.find(item => item.id === 'master-schedule')?.sharedWith).toBe(
      'You or your providers'
    );
  });
});
