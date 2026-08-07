/**
 * Master curriculum catalog — the single source of truth for every curriculum
 * a district can enable (SPE-422).
 *
 * District admins pick from this list (stored as `district_curriculums` rows
 * keyed by `id`); the session/group curriculum pickers show a district's
 * enabled entries and write `trackingValue` into
 * `curriculum_tracking.curriculum_type`.
 *
 * `trackingValue` is a compatibility contract, not a free choice: existing
 * `curriculum_tracking` rows store 'SPIRE' and 'Reveal Math', so those two
 * entries must keep exactly those strings or historical rows lose their
 * badges, banners, and progression prompts.
 */

export interface CurriculumLevelScheme {
  /** What a level is called in this program, e.g. "Level" or "Grade". */
  unitLabel: string;
  /** Ordered dropdown options. */
  options: string[];
  /** Compact prefix for calendar badges, e.g. 'L' → "L3", 'G' → "G2". */
  badgePrefix: string;
  /**
   * Prefix shown before numeric options in the level dropdown (e.g. 'Lvl '
   * renders "Lvl 3"). Non-numeric options ("Foundations", "K") render bare.
   */
  optionPrefix?: string;
}

export interface CurriculumCatalogEntry {
  /** Stable id stored in district_curriculums.curriculum_id. */
  id: string;
  /** Full display name. */
  name: string;
  /** Short name for tight spots (calendar badges). */
  badge: string;
  category: 'Reading' | 'Math' | 'Writing' | 'Social Skills' | 'General';
  /** Value written to curriculum_tracking.curriculum_type. */
  trackingValue: string;
  /**
   * Structured level list where the program has a well-known sequence;
   * null means the provider types the level (e.g. "Step 4") instead.
   */
  levels: CurriculumLevelScheme | null;
}

export const CURRICULUM_CATALOG: CurriculumCatalogEntry[] = [
  // Reading/Literacy Programs
  {
    id: 'spire',
    name: 'S.P.I.R.E.',
    badge: 'SPIRE',
    category: 'Reading',
    trackingValue: 'SPIRE',
    levels: {
      unitLabel: 'Level',
      options: ['Foundations', '1', '2', '3', '4', '5', '6', '7', '8'],
      badgePrefix: 'L',
      optionPrefix: 'Lvl ',
    },
  },
  { id: 'wilson-reading', name: 'Wilson Reading System', badge: 'Wilson', category: 'Reading', trackingValue: 'Wilson Reading System', levels: null },
  { id: 'orton-gillingham', name: 'Orton-Gillingham', badge: 'OG', category: 'Reading', trackingValue: 'Orton-Gillingham', levels: null },
  { id: 'lindamood-bell', name: 'Lindamood-Bell', badge: 'LMB', category: 'Reading', trackingValue: 'Lindamood-Bell', levels: null },
  { id: 'reading-mastery', name: 'Reading Mastery', badge: 'RM', category: 'Reading', trackingValue: 'Reading Mastery', levels: null },
  { id: 'corrective-reading', name: 'Corrective Reading', badge: 'CR', category: 'Reading', trackingValue: 'Corrective Reading', levels: null },
  { id: 'rewards', name: 'REWARDS', badge: 'REWARDS', category: 'Reading', trackingValue: 'REWARDS', levels: null },
  { id: 'phonics-first', name: 'Phonics First', badge: 'Phonics First', category: 'Reading', trackingValue: 'Phonics First', levels: null },
  { id: 'fundations', name: 'Fundations', badge: 'Fundations', category: 'Reading', trackingValue: 'Fundations', levels: null },
  { id: 'raz-kids', name: 'Raz-Kids', badge: 'Raz-Kids', category: 'Reading', trackingValue: 'Raz-Kids', levels: null },
  { id: 'lexia-core5', name: 'Lexia Core5', badge: 'Lexia', category: 'Reading', trackingValue: 'Lexia Core5', levels: null },

  // Math Programs
  {
    id: 'reveal-math',
    name: 'Reveal Math',
    badge: 'Reveal',
    category: 'Math',
    trackingValue: 'Reveal Math',
    levels: {
      unitLabel: 'Grade',
      options: ['K', '1', '2', '3', '4', '5'],
      badgePrefix: 'G',
    },
  },
  { id: 'touch-math', name: 'TouchMath', badge: 'TouchMath', category: 'Math', trackingValue: 'TouchMath', levels: null },
  { id: 'math-u-see', name: 'Math-U-See', badge: 'Math-U-See', category: 'Math', trackingValue: 'Math-U-See', levels: null },
  { id: 'saxon-math', name: 'Saxon Math', badge: 'Saxon', category: 'Math', trackingValue: 'Saxon Math', levels: null },
  { id: 'singapore-math', name: 'Singapore Math', badge: 'Singapore', category: 'Math', trackingValue: 'Singapore Math', levels: null },
  { id: 'enumeracy', name: 'Do The Math', badge: 'Do The Math', category: 'Math', trackingValue: 'Do The Math', levels: null },
  { id: 'number-worlds', name: 'Number Worlds', badge: 'Number Worlds', category: 'Math', trackingValue: 'Number Worlds', levels: null },
  { id: 'connecting-math', name: 'Connecting Math Concepts', badge: 'CMC', category: 'Math', trackingValue: 'Connecting Math Concepts', levels: null },

  // Writing Programs
  { id: 'handwriting-without-tears', name: 'Handwriting Without Tears', badge: 'HWT', category: 'Writing', trackingValue: 'Handwriting Without Tears', levels: null },
  { id: 'step-up-to-writing', name: 'Step Up to Writing', badge: 'Step Up', category: 'Writing', trackingValue: 'Step Up to Writing', levels: null },

  // Social Skills/Behavior
  { id: 'social-thinking', name: 'Social Thinking', badge: 'Social Thinking', category: 'Social Skills', trackingValue: 'Social Thinking', levels: null },
  { id: 'zones-of-regulation', name: 'Zones of Regulation', badge: 'Zones', category: 'Social Skills', trackingValue: 'Zones of Regulation', levels: null },
  { id: 'second-step', name: 'Second Step', badge: 'Second Step', category: 'Social Skills', trackingValue: 'Second Step', levels: null },
  { id: 'superflex', name: 'Superflex', badge: 'Superflex', category: 'Social Skills', trackingValue: 'Superflex', levels: null },

  // Multi-Sensory/General
  { id: 'unique-learning', name: 'Unique Learning System', badge: 'ULS', category: 'General', trackingValue: 'Unique Learning System', levels: null },
  { id: 'edmark', name: 'Edmark Reading Program', badge: 'Edmark', category: 'General', trackingValue: 'Edmark Reading Program', levels: null },
  { id: 'teachtown', name: 'TeachTown', badge: 'TeachTown', category: 'General', trackingValue: 'TeachTown', levels: null },
];

const byId = new Map(CURRICULUM_CATALOG.map((c) => [c.id, c]));
const byTrackingValue = new Map(CURRICULUM_CATALOG.map((c) => [c.trackingValue, c]));

export function getCurriculumById(id: string): CurriculumCatalogEntry | undefined {
  return byId.get(id);
}

/** Look up by the value stored in curriculum_tracking.curriculum_type. */
export function getCurriculumByTrackingValue(value: string): CurriculumCatalogEntry | undefined {
  return byTrackingValue.get(value);
}

/** Catalog ids resolved to entries, unknown ids dropped, catalog order kept. */
export function resolveCurriculumIds(ids: string[]): CurriculumCatalogEntry[] {
  const wanted = new Set(ids);
  return CURRICULUM_CATALOG.filter((c) => wanted.has(c.id));
}

export function isKnownCurriculumId(id: string): boolean {
  return byId.has(id);
}

/**
 * Full display title for banners, e.g. "S.P.I.R.E. Level 3",
 * "S.P.I.R.E. Foundations", "Reveal Math Grade K", "Wilson Reading System Step 4".
 * Compact structured options ("3", "K") get the unit label in front; wordy ones
 * ("Foundations", or anything typed for an unstructured program) already read
 * as names and stay bare — mirrors the pre-SPE-422 banner text exactly.
 */
export function formatCurriculumTitle(trackingValue: string, level: string): string {
  const entry = byTrackingValue.get(trackingValue);
  if (!entry) return `${trackingValue} ${level}`.trim();
  if (entry.levels && level.length <= 2) {
    return `${entry.name} ${entry.levels.unitLabel} ${level}`;
  }
  return `${entry.name} ${level}`.trim();
}
