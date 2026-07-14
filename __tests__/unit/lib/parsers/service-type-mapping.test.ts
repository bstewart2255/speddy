/**
 * Unit tests for goal-to-provider keyword routing (SPE-247).
 *
 * Pins the word-boundary matching that stops cross-contamination
 * (`writing` ⊄ "Handwriting", `ot` ⊄ "emotional"), the added OT `handwriting`
 * keyword, and the blank-metadata "needs review" predicate.
 */

import {
  doesTextMatchProvider,
  isGoalForProviderByKeywords,
  hasNoProviderRoutingSignal,
} from '@/lib/parsers/service-type-mapping';

describe('doesTextMatchProvider — word-boundary matching', () => {
  it('does not match "writing" inside "Handwriting" for resource', () => {
    expect(doesTextMatchProvider('Handwriting', 'resource')).toBe(false);
    expect(doesTextMatchProvider('Fine Motor / Handwriting', 'resource')).toBe(false);
    expect(doesTextMatchProvider('Handwriting (Spacing and pencil control)', 'resource')).toBe(false);
  });

  it('matches "Handwriting" for OT via the added keyword', () => {
    expect(doesTextMatchProvider('Handwriting', 'ot')).toBe(true);
    expect(doesTextMatchProvider('Fine Motor / Handwriting', 'ot')).toBe(true);
  });

  it('still matches genuine resource writing areas', () => {
    expect(doesTextMatchProvider('Written Expression', 'resource')).toBe(true);
    expect(doesTextMatchProvider('Writing', 'resource')).toBe(true);
    expect(doesTextMatchProvider('Reading', 'resource')).toBe(true);
    expect(doesTextMatchProvider('Math', 'resource')).toBe(true);
    // Word boundaries would drop the long form unless listed explicitly.
    expect(doesTextMatchProvider('Mathematics', 'resource')).toBe(true);
    expect(doesTextMatchProvider('Math Reasoning', 'resource')).toBe(true);
  });

  it('does not match "ot" inside "emotional" for OT', () => {
    expect(doesTextMatchProvider('Social/Emotional', 'ot')).toBe(false);
    expect(doesTextMatchProvider('Behavior (1 of 2)', 'ot')).toBe(false);
  });

  it('routes Social/Emotional to counseling', () => {
    expect(doesTextMatchProvider('Social/Emotional', 'counseling')).toBe(true);
    expect(doesTextMatchProvider('Behavior', 'counseling')).toBe(true);
  });

  it('matches the standalone "OT" token but not "ot" inside a word', () => {
    expect(doesTextMatchProvider('OT (1 of 1)', 'ot')).toBe(true);
    expect(doesTextMatchProvider('Occupational Therapist', 'ot')).toBe(true);
    // "robotics" contains "ot" only mid-word — must not match.
    expect(doesTextMatchProvider('Robotics elective', 'ot')).toBe(false);
  });

  it('matches speech and language areas for speech', () => {
    expect(doesTextMatchProvider('Speech/Language', 'speech')).toBe(true);
    expect(doesTextMatchProvider('Expressive Language', 'speech')).toBe(true);
    // A typo that isn't the whole word "language" is not matched.
    expect(doesTextMatchProvider('Receptive Languge', 'speech')).toBe(false);
  });

  it('treats roles without keywords (e.g. psychologist) as always matching', () => {
    expect(doesTextMatchProvider('anything at all', 'psychologist')).toBe(true);
  });

  it('returns false for empty text', () => {
    expect(doesTextMatchProvider('', 'resource')).toBe(false);
  });
});

describe('isGoalForProviderByKeywords', () => {
  it('routes a Handwriting goal to OT, not resource', () => {
    expect(isGoalForProviderByKeywords('Handwriting', 'OT (1 of 1)', 'Occupational Therapist', 'ot')).toBe(true);
    expect(isGoalForProviderByKeywords('Handwriting', 'OT (1 of 1)', 'Occupational Therapist', 'resource')).toBe(false);
  });

  it('filters a blank-metadata row for every keyworded role', () => {
    for (const role of ['resource', 'speech', 'ot', 'counseling']) {
      expect(isGoalForProviderByKeywords('', '', '', role)).toBe(false);
    }
  });

  it('imports everything for roles without a service code', () => {
    expect(isGoalForProviderByKeywords('', '', '', 'psychologist')).toBe(true);
  });
});

describe('hasNoProviderRoutingSignal', () => {
  it('is true only when all three routing columns are blank', () => {
    expect(hasNoProviderRoutingSignal('', '', '')).toBe(true);
    expect(hasNoProviderRoutingSignal('   ', '  ', '\t')).toBe(true);
    expect(hasNoProviderRoutingSignal(undefined, undefined, undefined)).toBe(true);
  });

  it('is false when any routing column carries text', () => {
    expect(hasNoProviderRoutingSignal('Reading', '', '')).toBe(false);
    expect(hasNoProviderRoutingSignal('', 'Academic #1', '')).toBe(false);
    expect(hasNoProviderRoutingSignal('', '', 'Resource Specialist')).toBe(false);
  });
});
