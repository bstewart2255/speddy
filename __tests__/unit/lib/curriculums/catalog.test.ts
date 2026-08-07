/**
 * SPE-422: the catalog is the single source of truth for district-enableable
 * curriculums, and its two legacy entries carry a compatibility contract with
 * pre-existing curriculum_tracking rows ('SPIRE' / 'Reveal Math'). These tests
 * pin that contract and the display behavior the calendar/modal rely on.
 */

import {
  CURRICULUM_CATALOG,
  getCurriculumById,
  getCurriculumByTrackingValue,
  resolveCurriculumIds,
  isKnownCurriculumId,
  formatCurriculumTitle,
} from '@/lib/curriculums/catalog';
import { formatCurriculumBadge } from '@/lib/utils/curriculum-helpers';

describe('curriculum catalog', () => {
  it('has unique ids and unique tracking values', () => {
    const ids = CURRICULUM_CATALOG.map((c) => c.id);
    const trackingValues = CURRICULUM_CATALOG.map((c) => c.trackingValue);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(trackingValues).size).toBe(trackingValues.length);
  });

  it('ids match the DB shape check on district_curriculums.curriculum_id', () => {
    for (const entry of CURRICULUM_CATALOG) {
      expect(entry.id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
    }
  });

  it('keeps the legacy tracking values existing curriculum_tracking rows store', () => {
    // Compatibility contract: pre-SPE-422 rows hold exactly these strings.
    expect(getCurriculumById('spire')?.trackingValue).toBe('SPIRE');
    expect(getCurriculumById('reveal-math')?.trackingValue).toBe('Reveal Math');
  });

  it('keeps the pre-SPE-422 level structures for the two structured programs', () => {
    expect(getCurriculumById('spire')?.levels?.options).toEqual([
      'Foundations', '1', '2', '3', '4', '5', '6', '7', '8',
    ]);
    expect(getCurriculumById('reveal-math')?.levels?.options).toEqual([
      'K', '1', '2', '3', '4', '5',
    ]);
  });

  it('looks up entries by tracking value', () => {
    expect(getCurriculumByTrackingValue('SPIRE')?.id).toBe('spire');
    expect(getCurriculumByTrackingValue('Wilson Reading System')?.id).toBe('wilson-reading');
    expect(getCurriculumByTrackingValue('not-a-curriculum')).toBeUndefined();
  });

  it('resolves ids in catalog order and drops unknown ids', () => {
    const resolved = resolveCurriculumIds(['reveal-math', 'bogus', 'spire']);
    expect(resolved.map((c) => c.id)).toEqual(['spire', 'reveal-math']);
    expect(isKnownCurriculumId('spire')).toBe(true);
    expect(isKnownCurriculumId('bogus')).toBe(false);
  });
});

describe('formatCurriculumTitle', () => {
  it('matches the pre-SPE-422 banner text for the two structured programs', () => {
    expect(formatCurriculumTitle('SPIRE', '3')).toBe('S.P.I.R.E. Level 3');
    expect(formatCurriculumTitle('SPIRE', 'Foundations')).toBe('S.P.I.R.E. Foundations');
    expect(formatCurriculumTitle('Reveal Math', 'K')).toBe('Reveal Math Grade K');
    expect(formatCurriculumTitle('Reveal Math', '2')).toBe('Reveal Math Grade 2');
  });

  it('renders unstructured programs with the typed level bare', () => {
    expect(formatCurriculumTitle('Wilson Reading System', 'Step 4')).toBe(
      'Wilson Reading System Step 4'
    );
  });

  it('falls back to the raw stored value for unknown curriculums', () => {
    expect(formatCurriculumTitle('Old Program', '2')).toBe('Old Program 2');
  });
});

describe('formatCurriculumBadge', () => {
  it('matches the pre-SPE-422 badges for the two structured programs', () => {
    expect(
      formatCurriculumBadge({ curriculum_type: 'SPIRE', curriculum_level: '3', current_lesson: 5 })
    ).toBe('SPIRE L3.5');
    expect(
      formatCurriculumBadge({ curriculum_type: 'Reveal Math', curriculum_level: '2', current_lesson: 10 })
    ).toBe('Reveal G2.10');
    expect(
      formatCurriculumBadge({ curriculum_type: 'Reveal Math', curriculum_level: 'K', current_lesson: 1 })
    ).toBe('Reveal GK.1');
  });

  it('renders SPIRE Foundations without the level prefix', () => {
    // Pre-SPE-422 this rendered "SPIRE LFoundations.2" — deliberate fix.
    expect(
      formatCurriculumBadge({
        curriculum_type: 'SPIRE',
        curriculum_level: 'Foundations',
        current_lesson: 2,
      })
    ).toBe('SPIRE Foundations.2');
  });

  it('uses the short badge name and bare level for unstructured programs', () => {
    expect(
      formatCurriculumBadge({
        curriculum_type: 'Wilson Reading System',
        curriculum_level: 'Step 4',
        current_lesson: 3,
      })
    ).toBe('Wilson Step 4.3');
  });

  it('falls back to the raw stored value for unknown curriculums', () => {
    expect(
      formatCurriculumBadge({ curriculum_type: 'Old Program', curriculum_level: '2', current_lesson: 1 })
    ).toBe('Old Program 2.1');
  });
});
