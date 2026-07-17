/**
 * Unit tests for collectUnmatched's school-filter suppression (SPE-268).
 *
 * An unmatched Deliveries/Class List row whose normalized name matches a
 * goals-report student that was excluded by school is suppressed (it was
 * correctly set aside, not "missing"); genuinely-unknown names still surface.
 * Keys here stand in for createNormalizedKey output — the point is that the
 * suppress set and the enrichment-map keys share one normalization. All data is
 * fictional.
 */

import { collectUnmatched } from '@/lib/import/respond';
import type { DeliveryRecord } from '@/lib/parsers/deliveries-parser';
import type { ClassListStudent } from '@/lib/parsers/class-list-parser';

const delivery = (name: string) => ({ name }) as unknown as DeliveryRecord;
const classListStudent = (name: string) => ({ name }) as unknown as ClassListStudent;

describe('collectUnmatched — school-filter suppression (SPE-268)', () => {
  it('suppresses a filtered-out (other-school) delivery but keeps genuinely-unknown ones', () => {
    const deliveries = new Map<string, DeliveryRecord>([
      ['ana-alvarez', delivery('Alvarez, Ana')], // matched — never unmatched
      ['ben-bishop', delivery('Bishop, Ben')], // filtered out by school → suppress
      ['uma-unknown', delivery('Unknown, Uma')], // genuinely unknown → keep
    ]);
    const result = collectUnmatched(
      deliveries,
      null,
      new Set(['ana-alvarez']), // matched delivery names
      new Set(),
      new Set(['ben-bishop']), // filtered-out (other-school) names
    );
    expect(result.map(r => r.name)).toEqual(['Unknown, Uma']);
  });

  it('applies the same suppression to the class-list source', () => {
    const classList = new Map<string, ClassListStudent>([
      ['ben-bishop', classListStudent('Bishop, Ben')],
      ['uma-unknown', classListStudent('Unknown, Uma')],
    ]);
    const result = collectUnmatched(null, classList, new Set(), new Set(), new Set(['ben-bishop']));
    expect(result.map(r => r.name)).toEqual(['Unknown, Uma']);
  });

  it('flags every unmatched student when no suppress set is passed (unchanged behavior)', () => {
    const deliveries = new Map<string, DeliveryRecord>([
      ['ben-bishop', delivery('Bishop, Ben')],
      ['uma-unknown', delivery('Unknown, Uma')],
    ]);
    const result = collectUnmatched(deliveries, null, new Set(), new Set());
    expect(result.map(r => r.name).sort()).toEqual(['Bishop, Ben', 'Unknown, Uma']);
  });
});
