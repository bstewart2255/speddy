import { mergeGoals } from '@/lib/import/merge-goals';

// SPE-234: the per-student import merges goals server-side. This pins the exact
// contract the acceptance requires (must match the retired client behavior):
// append-only, case-insensitive + trimmed dedupe, never remove/reorder.
describe('mergeGoals (SPE-234)', () => {
  it('appends goals not already present', () => {
    expect(mergeGoals(['A', 'B'], ['C'])).toEqual(['A', 'B', 'C']);
  });

  it('dedupes case-insensitively and after trimming, keeping the existing copy', () => {
    expect(mergeGoals(['Read 90 wpm'], ['  read 90 WPM  ', 'Add 2-digit'])).toEqual([
      'Read 90 wpm',
      'Add 2-digit',
    ]);
  });

  it('never removes or reorders existing goals (empty incoming is a no-op)', () => {
    expect(mergeGoals(['A', 'B', 'C'], [])).toEqual(['A', 'B', 'C']);
  });

  it('dedupes duplicates within the incoming batch too', () => {
    expect(mergeGoals([], ['G', 'g', ' G '])).toEqual(['G']);
  });

  it('does not mutate its inputs', () => {
    const existing = ['A'];
    const incoming = ['B'];
    mergeGoals(existing, incoming);
    expect(existing).toEqual(['A']);
    expect(incoming).toEqual(['B']);
  });
});
