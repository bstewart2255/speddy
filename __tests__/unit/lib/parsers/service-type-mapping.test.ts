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
  getServiceTypeCode,
  getDeliveryServiceTypeCode,
  isServiceCodeForRole,
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

describe('goal visibility vs. delivered service (SPE-554)', () => {
  it('keeps the psychologist goals import unfiltered', () => {
    // A school psych sits on every IEP team, so they see everyone's goals.
    expect(getServiceTypeCode('psychologist')).toBeNull();
    expect(isGoalForProviderByKeywords('Handwriting', 'OT (1 of 1)', 'OT', 'psychologist')).toBe(true);
  });

  it('filters the psychologist deliveries import to counseling (510)', () => {
    // But the service they DELIVER is counseling, and deliveries become their
    // own session requirements — so another provider's minutes must not land
    // in their caseload.
    expect(getDeliveryServiceTypeCode('psychologist')).toBe('510');
    expect(isServiceCodeForRole('510 - Individual Counseling', 'psychologist')).toBe(true);
    expect(isServiceCodeForRole('330 - Specialized Academic Instruction', 'psychologist')).toBe(false);
    expect(isServiceCodeForRole('415 - Language and Speech', 'psychologist')).toBe(false);
    expect(isServiceCodeForRole('450 - Occupational Therapy', 'psychologist')).toBe(false);
  });

  it('leaves every other role identical across both questions', () => {
    for (const role of ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea']) {
      expect(getDeliveryServiceTypeCode(role)).toBe(getServiceTypeCode(role));
    }
  });

  it('still accepts every service for a role with no code at all', () => {
    expect(getDeliveryServiceTypeCode('specialist')).toBeNull();
    expect(isServiceCodeForRole('330 - Specialized Academic Instruction', 'specialist')).toBe(true);
  });

  it('normalizes case and whitespace like its sibling lookup', () => {
    expect(getDeliveryServiceTypeCode(' Psychologist ')).toBe('510');
    expect(isServiceCodeForRole('510 - Individual Counseling', ' PSYCHOLOGIST ')).toBe(true);
  });

  it('returns null for an unknown role rather than throwing', () => {
    expect(getDeliveryServiceTypeCode('principal')).toBeNull();
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
