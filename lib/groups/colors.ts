/**
 * Groups v2 palette (SPE-312/313).
 *
 * A group's `color` is stored as an INDEX into this array — on
 * `session_groups.color` and the dual-written legacy `group_color` — never as a
 * hex string. Per design decision #6 the group color is a SMALL ACCENT only: it
 * appears in the group popover/modal and on the Week-view planning cards, and it
 * NEVER tints the Main Schedule board (a pill's fill there always means grade).
 *
 * Shared so the schedule popover and the Week view resolve the same swatches.
 */
export const GROUP_SWATCHES = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899'] as const;

/** Hex for a stored group color index, or null when unset / out of range. */
export function groupColorHex(index: number | null | undefined): string | null {
  if (index == null || index < 0 || index >= GROUP_SWATCHES.length) return null;
  return GROUP_SWATCHES[index];
}
