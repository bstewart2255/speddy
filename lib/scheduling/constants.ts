/**
 * The one grade → colour palette for the schedule surfaces (SPE-587).
 *
 * Covers every scheduling grade (`CANONICAL_GRADES`: TK, K, 1–12), not just
 * TK–5: a middle or high school's sessions used to fall through to a flat gray
 * because the map stopped at 5th.
 *
 * Each grade carries the three intensities the schedule uses, so the variants
 * can't drift apart the way four hand-copied maps did:
 *   - `overlay` (300) — visual availability shading, kept lighter so session
 *     blocks stay readable on top of it
 *   - `base` (400)    — the legend swatch, and the resting session block
 *   - `hover` (500)   — a session block under the cursor
 *
 * Tailwind can't build class names at runtime, so every value is a literal —
 * and this file is named in `tailwind.config.ts`'s `content` for that reason.
 * Adding a grade or a shade here without it being scanned emits no CSS at all,
 * which paints an unstyled (transparent) block rather than failing loudly.
 *
 * Hues are chosen so the grades that share a school stay distinguishable:
 * TK–5 keeps its established colours, 6–8 (middle) and 9–12 (high) are each
 * internally distinct, and a K-12 combined site shows all fifteen at once.
 */
interface GradeColor {
  overlay: string;
  base: string;
  hover: string;
}

const GRADE_COLORS: Record<string, GradeColor> = {
  TK: { overlay: 'bg-pink-300', base: 'bg-pink-400', hover: 'hover:bg-pink-500' },
  K: { overlay: 'bg-purple-300', base: 'bg-purple-400', hover: 'hover:bg-purple-500' },
  '1': { overlay: 'bg-sky-300', base: 'bg-sky-400', hover: 'hover:bg-sky-500' },
  '2': { overlay: 'bg-cyan-300', base: 'bg-cyan-400', hover: 'hover:bg-cyan-500' },
  '3': { overlay: 'bg-emerald-300', base: 'bg-emerald-400', hover: 'hover:bg-emerald-500' },
  '4': { overlay: 'bg-amber-300', base: 'bg-amber-400', hover: 'hover:bg-amber-500' },
  '5': { overlay: 'bg-rose-300', base: 'bg-rose-400', hover: 'hover:bg-rose-500' },
  '6': { overlay: 'bg-lime-300', base: 'bg-lime-400', hover: 'hover:bg-lime-500' },
  '7': { overlay: 'bg-teal-300', base: 'bg-teal-400', hover: 'hover:bg-teal-500' },
  '8': { overlay: 'bg-blue-300', base: 'bg-blue-400', hover: 'hover:bg-blue-500' },
  '9': { overlay: 'bg-indigo-300', base: 'bg-indigo-400', hover: 'hover:bg-indigo-500' },
  '10': { overlay: 'bg-violet-300', base: 'bg-violet-400', hover: 'hover:bg-violet-500' },
  '11': { overlay: 'bg-fuchsia-300', base: 'bg-fuchsia-400', hover: 'hover:bg-fuchsia-500' },
  // Not red: the grid reserves red for conflicts (`bg-red-100` plus a red
  // inset ring), so a healthy 12th-grade block must not read as a problem.
  '12': { overlay: 'bg-orange-300', base: 'bg-orange-400', hover: 'hover:bg-orange-500' },
};

const mapGradeColors = (pick: (c: GradeColor) => string): { [key: string]: string } =>
  Object.fromEntries(
    Object.entries(GRADE_COLORS).map(([grade, colors]) => [grade, pick(colors)])
  );

/** Lighter shading for the visual availability overlays. */
export const GRADE_COLOR_MAP = mapGradeColors((c) => c.overlay);

/** The legend swatch on the Grade Levels filter. */
export const GRADE_LEGEND_COLOR_MAP = mapGradeColors((c) => c.base);

/** A session block on the schedule grid, with its hover state. */
export const GRADE_SESSION_COLOR_MAP = mapGradeColors((c) => `${c.base} ${c.hover}`);
