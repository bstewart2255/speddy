/**
 * SPE-589: the Main Schedule's "View Sessions" card is offered only to
 * providers who share work — an SEA they can hand sessions to, or sessions
 * delegated in either direction. A provider working alone got a row of buttons
 * that all led to the same grid.
 *
 * These pin the three signals, the two ways the gate can fail open (an unknown
 * user, and an SEA's own inert filters), and the fallback that stops a
 * selection outliving the button that set it.
 *
 * `hasAssignableSeas` is the caller's SEA roster (`seaProfiles`), not the
 * school's staffing: only resource specialists are given that roster, so an SEA
 * at the site cannot put a session on a speech/OT/counseling grid and a filter
 * offered to them on staffing alone would never fill.
 *
 * All data is fictional.
 */

import {
  getSessionFilterAvailability,
  isSessionFilterOffered,
  type SessionFilterAvailability,
} from '@/app/(dashboard)/dashboard/schedule/utils/session-filter-availability';
import type { ScheduleSession } from '@/src/types';

const ME = 'provider-me';
const PEER = 'provider-peer';
const SEA_ID = 'sea-1';
const SPECIALIST_ID = 'specialist-1';

// Only the four delivery columns are read; the rest is shape.
const session = (fields: Partial<ScheduleSession>): ScheduleSession =>
  ({
    provider_id: ME,
    delivered_by: 'provider',
    assigned_to_sea_id: null,
    assigned_to_specialist_id: null,
    ...fields,
  }) as ScheduleSession;

/** A session this provider runs themselves — never a reason to show the card. */
const MY_OWN = session({});

const availability = (overrides: Partial<Parameters<typeof getSessionFilterAvailability>[0]> = {}) =>
  getSessionFilterAvailability({
    sessions: [MY_OWN],
    providerRole: 'resource',
    currentUserId: ME,
    hasAssignableSeas: false,
    ...overrides,
  });

describe('getSessionFilterAvailability (SPE-589)', () => {
  it('offers nothing to a provider working alone', () => {
    expect(availability()).toEqual({
      sea: false,
      specialist: false,
      assigned: false,
      showCard: false,
    });
  });

  it('offers the SEA filter as soon as there is an SEA to assign, before anything is', () => {
    // The one signal that is about a person existing rather than work already
    // delegated: the filter waits for the first assignment, it doesn't follow it.
    const result = availability({ hasAssignableSeas: true });

    expect(result.sea).toBe(true);
    expect(result.showCard).toBe(true);
    expect(result.specialist).toBe(false);
    expect(result.assigned).toBe(false);
  });

  it('withholds the SEA filter from a provider with no SEA roster', () => {
    // An empty roster is how speech/OT/counseling providers arrive here even at
    // a school that employs SEAs — they are never offered the list, so they
    // cannot delegate to one, and the button could only ever open a blank grid.
    // That is the dead control this ticket exists to remove, not an instance of
    // "the site has an SEA, so show it".
    const result = availability({ hasAssignableSeas: false, providerRole: 'speech' });

    expect(result.sea).toBe(false);
    expect(result.showCard).toBe(false);
  });

  it('keeps the SEA filter for leftover SEA sessions after the SEA leaves the school', () => {
    // The roster is empty — that SEA is gone — but their work is still on the
    // grid, so hiding the filter would strand it.
    const result = availability({
      hasAssignableSeas: false,
      sessions: [MY_OWN, session({ delivered_by: 'sea', assigned_to_sea_id: SEA_ID })],
    });

    expect(result.sea).toBe(true);
    expect(result.showCard).toBe(true);
  });

  it('offers the specialist filter once this provider hands work to a specialist', () => {
    const result = availability({
      sessions: [
        MY_OWN,
        session({ delivered_by: 'specialist', assigned_to_specialist_id: SPECIALIST_ID }),
      ],
    });

    expect(result.specialist).toBe(true);
    expect(result.showCard).toBe(true);
  });

  it('does not offer the specialist filter for another provider\'s delegation', () => {
    // The filter matches `provider_id = me`, so a peer's delegated session is
    // not this provider's to review. Pins the narrowing from the old gate,
    // which turned the button on as soon as any specialist existed at the site.
    const result = availability({
      sessions: [
        session({
          provider_id: PEER,
          delivered_by: 'specialist',
          assigned_to_specialist_id: SPECIALIST_ID,
        }),
      ],
    });

    expect(result.specialist).toBe(false);
    expect(result.showCard).toBe(false);
  });

  it('offers the assigned filter when someone else hands work to this provider', () => {
    const result = availability({
      sessions: [
        MY_OWN,
        session({
          provider_id: PEER,
          delivered_by: 'specialist',
          assigned_to_specialist_id: ME,
        }),
      ],
    });

    expect(result.assigned).toBe(true);
    expect(result.showCard).toBe(true);
  });

  it('offers nothing to an SEA, whose filters all return the same sessions', () => {
    // Control: this exact fixture lights up every flag for a resource provider,
    // so "nothing" below is the role guard firing rather than an empty input.
    const sessions = [session({ delivered_by: 'sea', assigned_to_sea_id: ME })];

    expect(availability({ sessions, hasAssignableSeas: true }).showCard).toBe(true);

    expect(
      availability({ sessions, hasAssignableSeas: true, providerRole: 'sea', currentUserId: SEA_ID })
    ).toEqual({ sea: false, specialist: false, assigned: false, showCard: false });
  });

  it('offers nothing when the user is unknown', () => {
    // filterScheduleSessions falls through to `return sessions` for 'assigned'
    // with no user id, so an unguarded probe would report every filter as
    // populated. Fail closed instead.
    const result = availability({
      currentUserId: null,
      hasAssignableSeas: true,
      sessions: [MY_OWN, session({ delivered_by: 'specialist', assigned_to_specialist_id: ME })],
    });

    expect(result).toEqual({ sea: false, specialist: false, assigned: false, showCard: false });
  });
});

describe('isSessionFilterOffered (SPE-589)', () => {
  const SEA_ONLY: SessionFilterAvailability = {
    sea: true,
    specialist: false,
    assigned: false,
    showCard: true,
  };
  const NONE: SessionFilterAvailability = {
    sea: false,
    specialist: false,
    assigned: false,
    showCard: false,
  };

  it('holds a filter whose button is on screen', () => {
    expect(isSessionFilterOffered('sea', SEA_ONLY)).toBe(true);
  });

  it('drops a filter whose button is gone', () => {
    // The provider switched to a school with no SEA while "SEA Sessions" was
    // active: without this the grid stays filtered by a control that is no
    // longer drawn, and the next drag-and-drop assigns to the old school's SEA.
    expect(isSessionFilterOffered('sea', NONE)).toBe(false);
    expect(isSessionFilterOffered('specialist', SEA_ONLY)).toBe(false);
    expect(isSessionFilterOffered('assigned', SEA_ONLY)).toBe(false);
  });

  it('carries all/mine with the card', () => {
    expect(isSessionFilterOffered('all', SEA_ONLY)).toBe(true);
    expect(isSessionFilterOffered('mine', SEA_ONLY)).toBe(true);
    expect(isSessionFilterOffered('mine', NONE)).toBe(false);
  });
});
