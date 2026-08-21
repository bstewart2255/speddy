import { filterScheduleSessions, type SessionFilter } from './session-filters';
import type { ScheduleSession } from '@/src/types';

/**
 * SPE-589: which of the Main Schedule's "View Sessions" filters are worth
 * offering, and therefore whether the card is worth drawing at all.
 *
 * A provider working alone — no SEA at the site, nothing delegated in either
 * direction — got a row of buttons that all led to the same grid. "All
 * Sessions" and "My Sessions" are the same set for them, so neither keeps the
 * card alive; the card appears only when one of the three sharing filters below
 * has something to say.
 */
export interface SessionFilterAvailability {
  /** This provider has an SEA to hand sessions to, or already has. */
  sea: boolean;
  /** This provider has handed sessions to another specialist. */
  specialist: boolean;
  /** Someone else has handed sessions to this provider. */
  assigned: boolean;
  /** True when any of the three above is — the card's own gate. */
  showCard: boolean;
}

const NOTHING_OFFERED: SessionFilterAvailability = Object.freeze({
  sea: false,
  specialist: false,
  assigned: false,
  showCard: false,
});

interface AvailabilityInput {
  sessions: ScheduleSession[];
  providerRole: string;
  currentUserId: string | null;
  /**
   * Are there SEAs at this school that this provider can hand sessions to —
   * `seaProfiles` from `useScheduleData`, which is both the school's SEA roster
   * and the "Assign to" picker's options. Not a plain "does the school employ an
   * SEA": only resource specialists are given that roster, so for every other
   * role an SEA at the site can never put a session on their grid, and a filter
   * offered on the school's staffing alone would be permanently empty for them.
   */
  hasAssignableSeas: boolean;
}

export function getSessionFilterAvailability({
  sessions,
  providerRole,
  currentUserId,
  hasAssignableSeas,
}: AvailabilityInput): SessionFilterAvailability {
  // An SEA's buttons do nothing: filterScheduleSessions returns their own
  // assigned sessions for every filter, so all five lead to one identical grid.
  if (providerRole === 'sea') {
    return NOTHING_OFFERED;
  }

  // Every signal below is "did this user delegate, or get delegated to", which
  // is unanswerable without knowing who they are. Fail closed — and note that
  // filterScheduleSessions fails OPEN on 'assigned' with no user id (it falls
  // through to `default: return sessions`), so an unguarded probe here would
  // report the filter as populated for everyone.
  if (!currentUserId) {
    return NOTHING_OFFERED;
  }

  // Ask the filter itself rather than re-deriving what it matches: a button is
  // worth offering exactly when pressing it would leave something on the grid.
  // No person is pre-selected, so this asks "any SEA / any specialist".
  const wouldShowSessions = (sessionFilter: SessionFilter) =>
    filterScheduleSessions({
      sessions,
      sessionFilter,
      providerRole,
      currentUserId,
      selectedSeaId: null,
      selectedSpecialistId: null,
    }).length > 0;

  // The SEA filter is the one gated on a person existing rather than on work
  // already delegated — a resource specialist with an SEA at their site should
  // find the filter waiting before they assign the first session, not after.
  // The second clause is for the leftovers: an SEA who has since moved schools
  // still has sessions on this grid, and those must stay reachable.
  const sea = hasAssignableSeas || wouldShowSessions('sea');
  const specialist = wouldShowSessions('specialist');
  const assigned = wouldShowSessions('assigned');

  return { sea, specialist, assigned, showCard: sea || specialist || assigned };
}

/**
 * Is `filter` one the user can currently see a button for? Guards against a
 * selection outliving its button — switching to a school with no SEA while
 * "SEA Sessions" is active would otherwise leave the grid filtered by a control
 * that is no longer on screen, and (via buildAssignmentUpdate) let the next
 * drag-and-drop assign the session to a person picked under the old school.
 */
export function isSessionFilterOffered(
  filter: SessionFilter,
  availability: SessionFilterAvailability
): boolean {
  switch (filter) {
    case 'sea':
      return availability.sea;
    case 'specialist':
      return availability.specialist;
    case 'assigned':
      return availability.assigned;
    default:
      // 'all' and 'mine' ride with the card: reachable whenever it is drawn.
      return availability.showCard;
  }
}
