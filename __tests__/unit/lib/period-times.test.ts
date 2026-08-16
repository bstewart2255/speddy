/**
 * SPE-513 — the shared period→time resolution rule.
 *
 * Service-time entries store period NAMES, not clock times; the drag warning,
 * the auto-scheduler and the availability bands all resolve names against the
 * school's bell rows through these helpers. These tests pin the normalization
 * rule (trim + case-insensitive), the duplicate collapse (earliest start
 * wins), and per-day separation (block schedules run the same period at
 * different times on different days).
 */
import {
  bellTimesKey,
  collapseBellTimes,
  resolvePeriodLabel,
  type BellRowLite,
} from '@/lib/scheduling/period-times';

const row = (
  day: number,
  period: string | null,
  start: string,
  end: string
): BellRowLite => ({ day_of_week: day, period_name: period, start_time: start, end_time: end });

describe('collapseBellTimes', () => {
  it('maps each (day, period) to its times', () => {
    const map = collapseBellTimes([
      row(1, 'Period 1', '08:30', '09:20'),
      row(1, 'Period 2', '09:25', '10:15'),
      row(2, 'Period 1', '08:30', '09:20'),
    ]);
    expect(map.get(bellTimesKey(1, 'Period 1'))).toEqual({ start: '08:30', end: '09:20' });
    expect(map.get(bellTimesKey(1, 'Period 2'))).toEqual({ start: '09:25', end: '10:15' });
    expect(map.get(bellTimesKey(2, 'Period 2'))).toBeUndefined();
  });

  it('keeps days separate for block schedules (same period, different times per day)', () => {
    const map = collapseBellTimes([
      row(1, 'Period 3', '10:20', '11:10'),
      row(3, 'Period 3', '11:00', '12:30'), // Wednesday block schedule
    ]);
    expect(map.get(bellTimesKey(1, 'Period 3'))).toEqual({ start: '10:20', end: '11:10' });
    expect(map.get(bellTimesKey(3, 'Period 3'))).toEqual({ start: '11:00', end: '12:30' });
  });

  it('collapses duplicate rows (several providers entered the grid) to the earliest start', () => {
    const map = collapseBellTimes([
      row(1, 'Period 1', '08:35', '09:20'),
      row(1, 'Period 1', '08:30', '09:15'),
      row(1, 'Period 1', '08:40', '09:25'),
    ]);
    expect(map.get(bellTimesKey(1, 'Period 1'))).toEqual({ start: '08:30', end: '09:15' });
  });

  it('matches period names case-insensitively and whitespace-tolerantly', () => {
    const map = collapseBellTimes([row(1, '  period 4 ', '11:15', '12:05')]);
    expect(map.get(bellTimesKey(1, 'Period 4'))).toEqual({ start: '11:15', end: '12:05' });
  });

  it('skips rows with no period name', () => {
    const map = collapseBellTimes([row(1, null, '08:00', '08:30'), row(1, '  ', '08:00', '08:30')]);
    expect(map.size).toBe(0);
  });
});

describe('resolvePeriodLabel', () => {
  const options = ['Period A', 'Period 1', 'Period 2', 'Period 3', 'Advisory'];

  it('matches exact labels, trimmed and case-insensitively', () => {
    expect(resolvePeriodLabel('Period 3', options)).toBe('Period 3');
    expect(resolvePeriodLabel(' period 3 ', options)).toBe('Period 3');
    expect(resolvePeriodLabel('ADVISORY', options)).toBe('Advisory');
  });

  it('resolves bare labels through the "Period <label>" fallback', () => {
    expect(resolvePeriodLabel('3', options)).toBe('Period 3');
    expect(resolvePeriodLabel('a', options)).toBe('Period A');
  });

  it('returns null for unknown, empty, and missing labels', () => {
    expect(resolvePeriodLabel('Period 9', options)).toBeNull();
    expect(resolvePeriodLabel('Homeroom', options)).toBeNull();
    expect(resolvePeriodLabel('', options)).toBeNull();
    expect(resolvePeriodLabel('   ', options)).toBeNull();
    expect(resolvePeriodLabel(null, options)).toBeNull();
    expect(resolvePeriodLabel(undefined, options)).toBeNull();
  });
});
