import {
  isoIntervalsToBusyBlocks,
  localDateToIso,
} from '@/lib/calendar/google-busy';

/** ISO instant built from LOCAL wall-clock parts — keeps tests TZ-agnostic. */
function localIso(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number
): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

describe('isoIntervalsToBusyBlocks', () => {
  it('converts a same-day interval to local date + minutes', () => {
    const blocks = isoIntervalsToBusyBlocks([
      { start: localIso(2026, 9, 15, 9, 0), end: localIso(2026, 9, 15, 10, 30) },
    ]);
    expect(blocks).toEqual([
      {
        date: '2026-09-15',
        start_minutes: 9 * 60,
        end_minutes: 10 * 60 + 30,
        source: 'google',
        label: 'Google Calendar',
      },
    ]);
  });

  it('splits midnight-crossing intervals into one block per date', () => {
    const blocks = isoIntervalsToBusyBlocks([
      { start: localIso(2026, 9, 15, 23, 0), end: localIso(2026, 9, 16, 1, 0) },
    ]);
    expect(blocks).toEqual([
      expect.objectContaining({
        date: '2026-09-15',
        start_minutes: 23 * 60,
        end_minutes: 24 * 60,
      }),
      expect.objectContaining({
        date: '2026-09-16',
        start_minutes: 0,
        end_minutes: 60,
      }),
    ]);
  });

  it('covers full intermediate days on multi-day spans', () => {
    const blocks = isoIntervalsToBusyBlocks([
      { start: localIso(2026, 9, 15, 22, 0), end: localIso(2026, 9, 17, 2, 0) },
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toEqual(
      expect.objectContaining({
        date: '2026-09-16',
        start_minutes: 0,
        end_minutes: 24 * 60,
      })
    );
  });

  it('drops malformed and zero-length intervals', () => {
    expect(
      isoIntervalsToBusyBlocks([
        { start: 'garbage', end: localIso(2026, 9, 15, 10, 0) },
        {
          start: localIso(2026, 9, 15, 10, 0),
          end: localIso(2026, 9, 15, 10, 0),
        },
      ])
    ).toEqual([]);
  });

  it('labels blocks for the availability engine', () => {
    const [block] = isoIntervalsToBusyBlocks(
      [{ start: localIso(2026, 9, 15, 9, 0), end: localIso(2026, 9, 15, 9, 30) }],
      'Shared calendar'
    );
    expect(block.source).toBe('google');
    expect(block.label).toBe('Shared calendar');
  });
});

describe('localDateToIso', () => {
  it('round-trips to local midnight', () => {
    const iso = localDateToIso('2026-09-15');
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([
      2026, 9, 15,
    ]);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('supports day offsets for exclusive range ends', () => {
    const d = new Date(localDateToIso('2026-09-30', 1));
    expect([d.getMonth() + 1, d.getDate()]).toEqual([10, 1]);
  });
});
