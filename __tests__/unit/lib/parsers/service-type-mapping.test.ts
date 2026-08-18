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
  getDeliveryServiceTypeCodes,
  isServiceCodeForRole,
  SERVICE_TYPE_CODES,
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

  it('filters the psychologist deliveries import to counseling', () => {
    // But the service they DELIVER is counseling, and deliveries become their
    // own session requirements — so another provider's minutes must not land
    // in their caseload.
    expect(isServiceCodeForRole('510 - Individual Counseling', 'psychologist')).toBe(true);
    expect(isServiceCodeForRole('330 - Specialized Academic Instruction', 'psychologist')).toBe(false);
    expect(isServiceCodeForRole('415 - Language and Speech', 'psychologist')).toBe(false);
    expect(isServiceCodeForRole('450 - Occupational Therapy', 'psychologist')).toBe(false);
  });

  it('accepts BOTH counseling codes — 510 and 515 — for psych and counselors', () => {
    // Which code a district uses is local convention, not a rule (JSUSD,
    // 2026-08-18). Matching only one imports nothing for districts on the other.
    for (const role of ['psychologist', 'counseling']) {
      expect(getDeliveryServiceTypeCodes(role)).toEqual(['510', '515']);
      expect(isServiceCodeForRole('510 - Individual Counseling', role)).toBe(true);
      expect(isServiceCodeForRole('515 - Counseling and Guidance', role)).toBe(true);
    }
  });

  it('keeps the single-service roles unchanged', () => {
    expect(getDeliveryServiceTypeCodes('resource')).toEqual(['330']);
    expect(getDeliveryServiceTypeCodes('speech')).toEqual(['415']);
    expect(getDeliveryServiceTypeCodes('ot')).toEqual(['450']);
    // A counseling row must not leak into an unrelated role's import.
    expect(isServiceCodeForRole('515 - Counseling and Guidance', 'resource')).toBe(false);
    expect(isServiceCodeForRole('510 - Individual Counseling', 'speech')).toBe(false);
  });

  it('still accepts every service for a role with no codes at all', () => {
    for (const role of ['specialist', 'sea', 'intervention']) {
      expect(getDeliveryServiceTypeCodes(role)).toEqual([]);
      expect(isServiceCodeForRole('330 - Specialized Academic Instruction', role)).toBe(true);
    }
  });

  it('normalizes case and whitespace', () => {
    expect(getDeliveryServiceTypeCodes(' Psychologist ')).toEqual(['510', '515']);
    expect(isServiceCodeForRole('515 - Counseling and Guidance', ' PSYCHOLOGIST ')).toBe(true);
  });

  it('returns no codes for an unknown role rather than throwing', () => {
    expect(getDeliveryServiceTypeCodes('principal')).toEqual([]);
  });

  it('gives every goal-coded role a delivery filter too — the map fails CLOSED', () => {
    // The two maps are maintained separately on purpose, which means a role
    // added to SERVICE_TYPE_CODES alone would accept EVERY service on the
    // delivery side — silently re-introducing SPE-554 for that role. If this
    // fails, add the new role to DELIVERY_SERVICE_TYPE_CODES as well.
    for (const [role, goalCode] of Object.entries(SERVICE_TYPE_CODES)) {
      if (goalCode === null) continue; // no goal code by design; covered above
      const deliveryCodes = getDeliveryServiceTypeCodes(role);
      expect(deliveryCodes.length).toBeGreaterThan(0);
      // A role's own service must stay importable on the delivery side.
      expect(deliveryCodes).toContain(goalCode);
    }
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
