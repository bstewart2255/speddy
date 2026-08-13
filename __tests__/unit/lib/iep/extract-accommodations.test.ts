/**
 * sanitizeAccommodations (SPE-489) — the defensive layer between the model's
 * tool output and what the review UI shows / the form eventually stores.
 * The tool schema is not strict-validated server-side by the API, so this is
 * the only guarantee the list is clean, bounded strings.
 */
import { sanitizeAccommodations } from '@/lib/iep/extract-accommodations';

describe('sanitizeAccommodations', () => {
  it('returns an empty list for non-array input', () => {
    expect(sanitizeAccommodations(undefined)).toEqual([]);
    expect(sanitizeAccommodations(null)).toEqual([]);
    expect(sanitizeAccommodations('extended time')).toEqual([]);
    expect(sanitizeAccommodations({ accommodations: [] })).toEqual([]);
  });

  it('trims and collapses internal whitespace', () => {
    expect(sanitizeAccommodations(['  Extended   time\n on tests  '])).toEqual([
      'Extended time on tests',
    ]);
  });

  it('drops non-strings and empty entries', () => {
    expect(sanitizeAccommodations([42, null, '', '   ', 'Preferential seating'])).toEqual([
      'Preferential seating',
    ]);
  });

  it('de-duplicates case-insensitively, keeping the first occurrence', () => {
    expect(
      sanitizeAccommodations(['Preferential seating', 'preferential SEATING', 'Extra time'])
    ).toEqual(['Preferential seating', 'Extra time']);
  });

  it('caps item length and list size', () => {
    const long = 'a'.repeat(5000);
    const many = Array.from({ length: 150 }, (_, i) => `Accommodation ${i}`);
    const [first] = sanitizeAccommodations([long]);
    expect(first).toHaveLength(1000);
    expect(sanitizeAccommodations(many)).toHaveLength(100);
  });
});
