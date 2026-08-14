/**
 * Activity-type colors, in one place (SPE-34).
 *
 * The same seven activity types were coloured in four components, in three
 * different formats, with no link between them — so "make Garden green" meant
 * finding all four and getting all four right.
 *
 * ## This is a consolidation, not a reconciliation
 *
 * The four maps did NOT agree, and this file deliberately preserves that
 * disagreement value-for-value. `solid` (the rotation-groups panel) assigns
 * hues that have nothing to do with the other three: Library is violet there
 * and blue everywhere else, STEAM and STEM share one amber, PE is blue rather
 * than red. Unifying them would change what the app renders, and SPE-34's
 * acceptance criteria are explicit that there is no visual change.
 *
 * So: one source of truth for WHERE the colors live, with the existing values
 * intact. Whether `solid` should be brought in line with the rest is a design
 * decision, and a separate one.
 *
 * ## Why the Tailwind classes are written out in full
 *
 * Tailwind's JIT scans source text for complete class names — it cannot see
 * `bg-${hue}-200`. Every class below is a whole literal for that reason, and
 * `tailwind.config.ts` had to learn to scan `lib/` for them to survive a build.
 */

/** The activity types that carry a colour. Anything else falls back to grey. */
export const COLORED_ACTIVITY_TYPES = [
  'Library',
  'STEAM',
  'STEM',
  'Garden',
  'Music',
  'ART',
  'PE',
] as const;

export type ColoredActivityType = (typeof COLORED_ACTIVITY_TYPES)[number];

/**
 * Solid hex, used by the rotation-groups panel for its activity dots.
 * Its hues are its own — see the note above before "fixing" them.
 */
export const ACTIVITY_SOLID_HEX: Record<string, string> = {
  Library: '#8B5CF6',
  STEAM: '#F59E0B',
  STEM: '#F59E0B',
  Garden: '#10B981',
  Music: '#EC4899',
  ART: '#EF4444',
  PE: '#3B82F6',
};

export const DEFAULT_ACTIVITY_SOLID_HEX = '#6B7280';

/** Background/border hex pair, used by the rotation schedule item. */
export const ACTIVITY_HEX: Record<string, { bg: string; border: string }> = {
  Library: { bg: '#BFDBFE', border: '#60A5FA' },
  STEAM: { bg: '#FED7AA', border: '#FB923C' },
  STEM: { bg: '#99F6E4', border: '#2DD4BF' },
  Garden: { bg: '#D9F99D', border: '#84CC16' },
  Music: { bg: '#DDD6FE', border: '#A78BFA' },
  ART: { bg: '#F5D0FE', border: '#E879F9' },
  PE: { bg: '#FECACA', border: '#F87171' },
};

export const DEFAULT_ACTIVITY_HEX = { bg: '#E5E7EB', border: '#9CA3AF' };

/** Tailwind bg+border pair, used by the admin schedule grid. */
export const ACTIVITY_GRID_CLASSES: Record<string, string> = {
  Library: 'bg-blue-200 border-blue-400',
  STEAM: 'bg-orange-200 border-orange-400',
  STEM: 'bg-teal-200 border-teal-400',
  Garden: 'bg-lime-200 border-lime-400',
  Music: 'bg-violet-200 border-violet-400',
  ART: 'bg-fuchsia-200 border-fuchsia-400',
  PE: 'bg-red-200 border-red-400',
};

export const DEFAULT_ACTIVITY_GRID_CLASSES = 'bg-gray-200 border-gray-400';

/**
 * Tailwind classes for the filter chips, which need a third state (selected).
 * Lighter shades than the grid so an unselected chip reads as a control rather
 * than as a block on the schedule.
 */
export const ACTIVITY_FILTER_CLASSES: Record<
  string,
  { bg: string; border: string; selectedBg: string }
> = {
  Library: { bg: 'bg-blue-50', border: 'border-blue-300', selectedBg: 'bg-blue-200' },
  STEAM: { bg: 'bg-orange-50', border: 'border-orange-300', selectedBg: 'bg-orange-200' },
  STEM: { bg: 'bg-teal-50', border: 'border-teal-300', selectedBg: 'bg-teal-200' },
  Garden: { bg: 'bg-lime-50', border: 'border-lime-300', selectedBg: 'bg-lime-200' },
  Music: { bg: 'bg-violet-50', border: 'border-violet-300', selectedBg: 'bg-violet-200' },
  ART: { bg: 'bg-fuchsia-50', border: 'border-fuchsia-300', selectedBg: 'bg-fuchsia-200' },
  PE: { bg: 'bg-red-50', border: 'border-red-300', selectedBg: 'bg-red-200' },
};

export const DEFAULT_ACTIVITY_FILTER_CLASSES = {
  bg: 'bg-gray-50',
  border: 'border-gray-300',
  selectedBg: 'bg-gray-200',
};
