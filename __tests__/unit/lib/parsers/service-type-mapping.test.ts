/**
 * Unit tests for role-based goal matching (SPE-247).
 *
 * Pins word-boundary keyword matching (no substring cross-contamination),
 * the Handwriting -> OT coverage fix, and blank-metadata detection. All values
 * fictional.
 */

import {
  doesTextMatchProvider,
  isBlankGoalMetadata,
  isGoalForProviderByKeywords,
} from '@/lib/parsers/service-type-mapping';

describe('doesTextMatchProvider — word-boundary keyword matching', () => {
  it('does not let the resource "writing" keyword match "Handwriting"', () => {
    expect(doesTextMatchProvider('Handwriting', 'resource')).toBe(false);
    expect(doesTextMatchProvider('Fine Motor / Handwriting', 'resource')).toBe(false);
  });

  it('routes handwriting areas to OT', () => {
    expect(doesTextMatchProvider('Handwriting', 'ot')).toBe(true);
    expect(doesTextMatchProvider('Handwriting (spacing and pencil control)', 'ot')).toBe(true);
    expect(doesTextMatchProvider('Fine Motor / Handwriting', 'ot')).toBe(true);
  });

  it('does not let the 2-letter "ot" keyword match "emotional"', () => {
    expect(doesTextMatchProvider('Social/Emotional', 'ot')).toBe(false);
    expect(doesTextMatchProvider('Social/Emotional', 'counseling')).toBe(true);
  });

  it('still matches legitimate whole-word keywords', () => {
    expect(doesTextMatchProvider('Occupational Therapy', 'ot')).toBe(true);
    expect(doesTextMatchProvider('OT', 'ot')).toBe(true);
    expect(doesTextMatchProvider('Reading comprehension', 'resource')).toBe(true);
    expect(doesTextMatchProvider('Written Expression', 'resource')).toBe(true);
    expect(doesTextMatchProvider('Speech/Language', 'speech')).toBe(true);
    expect(doesTextMatchProvider('Math', 'resource')).toBe(true);
  });

  it('does not match an unrelated word that merely contains a keyword', () => {
    // "another" contains "ot"; "robot" contains "ot"; neither is OT.
    expect(doesTextMatchProvider('another goal', 'ot')).toBe(false);
    expect(doesTextMatchProvider('robotics club', 'ot')).toBe(false);
  });

  it('never filters roles that have no keyword set (e.g. psychologist)', () => {
    expect(doesTextMatchProvider('anything at all', 'psychologist')).toBe(true);
  });
});

describe('isBlankGoalMetadata', () => {
  it('is true only when every provider-signal column is blank', () => {
    expect(isBlankGoalMetadata('', '', '')).toBe(true);
    expect(isBlankGoalMetadata(undefined, undefined, undefined)).toBe(true);
    expect(isBlankGoalMetadata('   ', '', undefined)).toBe(true);
  });

  it('is false when any column carries text — even unrecognized text', () => {
    expect(isBlankGoalMetadata('Receptive Languge', '', '')).toBe(false);
    expect(isBlankGoalMetadata('', 'Comm (1 of 1)', '')).toBe(false);
    expect(isBlankGoalMetadata('', '', 'Case Manager')).toBe(false);
  });
});

describe('isGoalForProviderByKeywords — multi-column attribution', () => {
  it('keeps a mixed-signal Handwriting/Academic row for both resource and OT', () => {
    // Foster-like row: Handwriting area, "Academic #3" goal, OT person.
    const area = 'Handwriting';
    const goal = 'Academic #3';
    const person = 'Occupational Therapist';
    expect(isGoalForProviderByKeywords(area, goal, person, 'resource')).toBe(true); // via "Academic"
    expect(isGoalForProviderByKeywords(area, goal, person, 'ot')).toBe(true); // via "Handwriting"/"Occupational"
  });

  it('excludes a pure Handwriting goal from resource but keeps it for OT', () => {
    expect(isGoalForProviderByKeywords('Handwriting', 'Goal 1', 'Therapist', 'resource')).toBe(false);
    expect(isGoalForProviderByKeywords('Handwriting', 'Goal 1', 'Therapist', 'ot')).toBe(true);
  });
});
