/**
 * SPE-34 — the consolidation must not repaint anything.
 *
 * Four components defined the same seven activity types in three formats, and
 * they did NOT agree: the rotation-groups panel's `solid` hues are unrelated to
 * the other three (Library violet vs blue, STEAM and STEM sharing one amber, PE
 * blue vs red). Moving them into one file makes that disagreement visible for
 * the first time, and the obvious next instinct — "harmonize them" — is a
 * visual change, which this ticket explicitly excludes.
 *
 * So these tests pin the values as they were before the move. If someone later
 * decides `solid` should match the rest, that is a design decision and this
 * file is where it should be argued, not a silent tidy-up.
 *
 * The second block guards the subtler trap: Tailwind's JIT only emits classes
 * it finds as complete literal text. A refactor to `bg-${hue}-200` typechecks,
 * passes every other test, and ships a page with no colours on it.
 */
import {
  ACTIVITY_FILTER_CLASSES,
  ACTIVITY_GRID_CLASSES,
  ACTIVITY_HEX,
  ACTIVITY_SOLID_HEX,
  COLORED_ACTIVITY_TYPES,
  DEFAULT_ACTIVITY_FILTER_CLASSES,
  DEFAULT_ACTIVITY_GRID_CLASSES,
  DEFAULT_ACTIVITY_HEX,
  DEFAULT_ACTIVITY_SOLID_HEX,
} from '@/lib/constants/activity-colors';

describe('activity colors are unchanged by the consolidation (SPE-34)', () => {
  it('keeps the rotation-groups panel solid hues, including their oddities', () => {
    expect(ACTIVITY_SOLID_HEX).toEqual({
      Library: '#8B5CF6',
      STEAM: '#F59E0B',
      STEM: '#F59E0B', // deliberately identical to STEAM, as it was
      Garden: '#10B981',
      Music: '#EC4899',
      ART: '#EF4444',
      PE: '#3B82F6',
    });
    expect(DEFAULT_ACTIVITY_SOLID_HEX).toBe('#6B7280');
  });

  it('keeps the rotation schedule item bg/border hex pairs', () => {
    expect(ACTIVITY_HEX).toEqual({
      Library: { bg: '#BFDBFE', border: '#60A5FA' },
      STEAM: { bg: '#FED7AA', border: '#FB923C' },
      STEM: { bg: '#99F6E4', border: '#2DD4BF' },
      Garden: { bg: '#D9F99D', border: '#84CC16' },
      Music: { bg: '#DDD6FE', border: '#A78BFA' },
      ART: { bg: '#F5D0FE', border: '#E879F9' },
      PE: { bg: '#FECACA', border: '#F87171' },
    });
    expect(DEFAULT_ACTIVITY_HEX).toEqual({ bg: '#E5E7EB', border: '#9CA3AF' });
  });

  it('keeps the admin grid Tailwind classes', () => {
    expect(ACTIVITY_GRID_CLASSES).toEqual({
      Library: 'bg-blue-200 border-blue-400',
      STEAM: 'bg-orange-200 border-orange-400',
      STEM: 'bg-teal-200 border-teal-400',
      Garden: 'bg-lime-200 border-lime-400',
      Music: 'bg-violet-200 border-violet-400',
      ART: 'bg-fuchsia-200 border-fuchsia-400',
      PE: 'bg-red-200 border-red-400',
    });
    expect(DEFAULT_ACTIVITY_GRID_CLASSES).toBe('bg-gray-200 border-gray-400');
  });

  it('keeps the filter chip Tailwind classes', () => {
    expect(ACTIVITY_FILTER_CLASSES).toEqual({
      Library: { bg: 'bg-blue-50', border: 'border-blue-300', selectedBg: 'bg-blue-200' },
      STEAM: { bg: 'bg-orange-50', border: 'border-orange-300', selectedBg: 'bg-orange-200' },
      STEM: { bg: 'bg-teal-50', border: 'border-teal-300', selectedBg: 'bg-teal-200' },
      Garden: { bg: 'bg-lime-50', border: 'border-lime-300', selectedBg: 'bg-lime-200' },
      Music: { bg: 'bg-violet-50', border: 'border-violet-300', selectedBg: 'bg-violet-200' },
      ART: { bg: 'bg-fuchsia-50', border: 'border-fuchsia-300', selectedBg: 'bg-fuchsia-200' },
      PE: { bg: 'bg-red-50', border: 'border-red-300', selectedBg: 'bg-red-200' },
    });
    expect(DEFAULT_ACTIVITY_FILTER_CLASSES).toEqual({
      bg: 'bg-gray-50',
      border: 'border-gray-300',
      selectedBg: 'bg-gray-200',
    });
  });

  it('covers every colored type in all four maps', () => {
    for (const type of COLORED_ACTIVITY_TYPES) {
      expect(ACTIVITY_SOLID_HEX[type]).toBeDefined();
      expect(ACTIVITY_HEX[type]).toBeDefined();
      expect(ACTIVITY_GRID_CLASSES[type]).toBeDefined();
      expect(ACTIVITY_FILTER_CLASSES[type]).toBeDefined();
    }
  });
});

describe('the Tailwind classes stay statically analyzable', () => {
  const allClassStrings = [
    ...Object.values(ACTIVITY_GRID_CLASSES),
    DEFAULT_ACTIVITY_GRID_CLASSES,
    ...Object.values(ACTIVITY_FILTER_CLASSES).flatMap((v) => Object.values(v)),
    ...Object.values(DEFAULT_ACTIVITY_FILTER_CLASSES),
  ];

  it('writes every class as a whole literal, never interpolated', () => {
    // Tailwind's JIT greps source text. `bg-${hue}-200` is invisible to it, so
    // the class is purged and the element renders unstyled — a failure no
    // typecheck and no other test in this repo would catch.
    for (const s of allClassStrings) {
      expect(s).not.toMatch(/\$\{|\+/);
      expect(s).toMatch(/^[a-z0-9- ]+$/);
    }
  });

  it('is covered by a Tailwind content glob', () => {
    // These literals only survive a build because tailwind.config.ts scans
    // lib/. Without that glob every class above is purged: verified by
    // rebuilding with the glob removed, which drops all of them from the CSS.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require('../../../../tailwind.config.ts').default;
    const globs: string[] = config.content;
    expect(globs.some((g) => g.startsWith('./lib/'))).toBe(true);
  });
});
