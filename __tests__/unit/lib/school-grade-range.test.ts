/**
 * SPE-587: the Grade Levels filter on the Schedule page offered a hardcoded
 * TK–5, so at a middle or high school it matched no student at all and every
 * session rendered dimmed with no toggle to restore it.
 *
 * Pins the three pieces that fix it:
 * - `getSchoolGradeRange` — the grades a school actually offers,
 * - `formatGradeShort` — how those grades read in the legend,
 * - the schedule palette — a colour for every scheduling grade, not just TK–5.
 */

import { getSchoolGradeRange } from '@/lib/school-helpers';
import { formatGradeShort } from '@/lib/utils/grade-level';
import { CANONICAL_GRADES } from '@/lib/utils/grade-parser';
import {
  GRADE_COLOR_MAP,
  GRADE_LEGEND_COLOR_MAP,
  GRADE_SESSION_COLOR_MAP,
} from '@/lib/scheduling/constants';
import tailwindConfig from '@/tailwind.config';

const ELEMENTARY_DEFAULT = ['TK', 'K', '1', '2', '3', '4', '5'];

describe('getSchoolGradeRange', () => {
  it('gives the John Swett pilot sites their own grades', () => {
    // The three schools exactly as prod records them (2026-08-21).
    expect(
      getSchoolGradeRange({
        school_type: 'High',
        grade_span_low: '09',
        grade_span_high: '12',
      })
    ).toEqual(['9', '10', '11', '12']);

    expect(
      getSchoolGradeRange({
        school_type: 'Middle',
        grade_span_low: '6',
        grade_span_high: '8',
      })
    ).toEqual(['6', '7', '8']);

    expect(
      getSchoolGradeRange({
        school_type: 'Elementary',
        grade_span_low: 'K',
        grade_span_high: '5',
      })
    ).toEqual(ELEMENTARY_DEFAULT);
  });

  it('offers no elementary grade at a high school — the reported bug', () => {
    const grades = getSchoolGradeRange({
      school_type: 'High',
      grade_span_low: '09',
      grade_span_high: '12',
    });
    for (const elementary of ELEMENTARY_DEFAULT) {
      expect(grades).not.toContain(elementary);
    }
  });

  it('carries a combined site past 5th — K-8 and K-12 classify as elementary', () => {
    expect(
      getSchoolGradeRange({
        school_type: 'K-8',
        grade_span_low: 'K',
        grade_span_high: '8',
      })
    ).toEqual(['TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8']);

    expect(
      getSchoolGradeRange({
        school_type: 'K-12',
        grade_span_low: 'K',
        grade_span_high: '12',
      })
    ).toEqual([
      'TK', 'K', '1', '2', '3', '4', '5',
      '6', '7', '8', '9', '10', '11', '12',
    ]);
  });

  it('falls back to TK-5 when there is nothing usable to derive from', () => {
    expect(getSchoolGradeRange(null)).toEqual(ELEMENTARY_DEFAULT);
    expect(getSchoolGradeRange(undefined)).toEqual(ELEMENTARY_DEFAULT);
    expect(getSchoolGradeRange({})).toEqual(ELEMENTARY_DEFAULT);
    // A legacy site with no school_type reads as elementary (SPE-152).
    expect(getSchoolGradeRange({ school_type: null })).toEqual(ELEMENTARY_DEFAULT);
  });

  it('falls back within the school\'s own level, never across it', () => {
    // A secondary site with no usable span falls back to 6-12, NOT to the
    // elementary TK-5: an unfilled grade span is no reason to hand a high
    // school the exact legend this ticket removed. The type an admin chose is
    // the better evidence. (CodeRabbit proposed the opposite on PR #925.)
    expect(getSchoolGradeRange({ school_type: 'High' })).toEqual([
      '6', '7', '8', '9', '10', '11', '12',
    ]);
    expect(getSchoolGradeRange({ school_type: 'Middle' })).toEqual([
      '6', '7', '8', '9', '10', '11', '12',
    ]);
    expect(
      getSchoolGradeRange({
        school_type: 'High',
        grade_span_low: '11',
        grade_span_high: '9',
      })
    ).toEqual(['6', '7', '8', '9', '10', '11', '12']);

    for (const type of ['High', 'Middle', 'Junior High', 'Secondary']) {
      const grades = getSchoolGradeRange({ school_type: type });
      expect(grades).not.toContain('TK');
      expect(grades).not.toContain('K');
      expect(grades).not.toContain('5');
    }
  });

  it('leads with TK whenever the span reaches kindergarten', () => {
    // Spans are recorded as K; TK students are entered against them anyway.
    expect(getSchoolGradeRange({ grade_span_low: 'K', grade_span_high: '2' })).toEqual([
      'TK', 'K', '1', '2',
    ]);
    expect(getSchoolGradeRange({ grade_span_low: 'TK', grade_span_high: '1' })).toEqual([
      'TK', 'K', '1',
    ]);
    // A kindergarten-only site still offers both.
    expect(getSchoolGradeRange({ grade_span_low: 'K', grade_span_high: 'K' })).toEqual([
      'TK', 'K',
    ]);
    // …but a site starting at 1st offers neither.
    expect(getSchoolGradeRange({ grade_span_low: '1', grade_span_high: '3' })).toEqual([
      '1', '2', '3',
    ]);
  });

  it('lets an explicit Elementary type keep its own span', () => {
    // classifyByType wins the elementary/secondary call; the span still says
    // which grades the site runs.
    expect(
      getSchoolGradeRange({
        school_type: 'Elementary',
        grade_span_low: '6',
        grade_span_high: '8',
      })
    ).toEqual(['6', '7', '8']);
  });

  it('refuses to emit a grade the scheduling layer does not know', () => {
    // SEIS writes codes like 17 (Preschool) and 13 (Transition) — SPE-467/580.
    // A span carrying one must not produce a 13th–17th grade chip.
    expect(
      getSchoolGradeRange({ grade_span_low: 'K', grade_span_high: '17' })
    ).toEqual([
      'TK', 'K', '1', '2', '3', '4', '5',
      '6', '7', '8', '9', '10', '11', '12',
    ]);

    // An inverted span is unusable, not a reason to emit nothing.
    expect(
      getSchoolGradeRange({ grade_span_low: '5', grade_span_high: '1' })
    ).toEqual(ELEMENTARY_DEFAULT);

    const spans: Array<[string | null, string | null]> = [
      ['K', '5'], ['K', '8'], ['1', '6'], ['09', '12'], ['6', '8'],
      [null, null], ['???', '???'], ['K', '17'], ['5', '1'],
    ];
    for (const [low, high] of spans) {
      for (const grade of getSchoolGradeRange({
        grade_span_low: low,
        grade_span_high: high,
      })) {
        expect(CANONICAL_GRADES).toContain(grade);
      }
    }
  });
});

describe('formatGradeShort', () => {
  it('keeps TK and K, and ordinalises the numbered grades', () => {
    expect(formatGradeShort('TK')).toBe('TK');
    expect(formatGradeShort('K')).toBe('K');
    expect(formatGradeShort('1')).toBe('1st');
    expect(formatGradeShort('2')).toBe('2nd');
    expect(formatGradeShort('3')).toBe('3rd');
    expect(formatGradeShort('4')).toBe('4th');
    expect(formatGradeShort('9')).toBe('9th');
    expect(formatGradeShort('11')).toBe('11th');
    expect(formatGradeShort('12')).toBe('12th');
  });

  it('tolerates case and whitespace', () => {
    expect(formatGradeShort('tk')).toBe('TK');
    expect(formatGradeShort(' k ')).toBe('K');
    expect(formatGradeShort(' 7 ')).toBe('7th');
  });

  it('hands back anything it cannot ordinalise', () => {
    // An unreadable imported grade shows as itself, never as a made-up ordinal.
    expect(formatGradeShort('Preschool')).toBe('Preschool');
    expect(formatGradeShort('12a')).toBe('12a');
    expect(formatGradeShort('')).toBe('');
    expect(formatGradeShort(null)).toBe('');
    expect(formatGradeShort(undefined)).toBe('');
  });

  it('labels every grade a school can offer', () => {
    for (const grade of CANONICAL_GRADES) {
      expect(formatGradeShort(grade)).not.toBe('');
    }
  });
});

describe('schedule grade palette', () => {
  const maps = {
    GRADE_COLOR_MAP,
    GRADE_LEGEND_COLOR_MAP,
    GRADE_SESSION_COLOR_MAP,
  };

  it('colours every scheduling grade, not just TK-5', () => {
    for (const [name, map] of Object.entries(maps)) {
      for (const grade of CANONICAL_GRADES) {
        expect(`${name}[${grade}]=${map[grade] ?? ''}`).toMatch(/=bg-/);
      }
    }
  });

  it('keeps the three intensities in step', () => {
    const keys = Object.keys(GRADE_COLOR_MAP);
    expect(new Set(keys)).toEqual(new Set(CANONICAL_GRADES));
    expect(Object.keys(GRADE_LEGEND_COLOR_MAP)).toEqual(keys);
    expect(Object.keys(GRADE_SESSION_COLOR_MAP)).toEqual(keys);
  });

  it('gives each grade a distinct hue so a K-12 site stays readable', () => {
    const hues = Object.values(GRADE_LEGEND_COLOR_MAP).map((c) =>
      c.replace(/^bg-/, '').replace(/-\d+$/, '')
    );
    expect(new Set(hues).size).toBe(hues.length);
  });

  it('sits in a file Tailwind scans, or none of it reaches the browser', () => {
    // The JIT only emits classes it finds as literal text. These colours used
    // to live under app/, which is scanned; a file outside `content` compiles
    // and tests clean while painting transparent blocks in production, so the
    // coupling gets pinned rather than trusted.
    expect(tailwindConfig.content).toContain('./lib/scheduling/constants.ts');
  });

  it('keeps red for conflicts — no grade may claim it', () => {
    // The grid marks a conflicted session with bg-red-100 and a red inset
    // ring; a healthy block in red would read as a problem.
    for (const map of Object.values(maps)) {
      for (const value of Object.values(map)) {
        expect(value).not.toMatch(/\bhover:bg-red-|\bbg-red-/);
      }
    }
  });

  it('gives session blocks a hover state and overlays a lighter shade', () => {
    for (const grade of CANONICAL_GRADES) {
      expect(GRADE_SESSION_COLOR_MAP[grade]).toMatch(/^bg-[a-z]+-400 hover:bg-[a-z]+-500$/);
      expect(GRADE_COLOR_MAP[grade]).toMatch(/^bg-[a-z]+-300$/);
      expect(GRADE_LEGEND_COLOR_MAP[grade]).toMatch(/^bg-[a-z]+-400$/);
    }
  });
});
