/**
 * Golden-fixture tests for the SEIS Deliveries CSV parser (SPE-239).
 * Pins parseFrequency / calculateSessions arithmetic and the full
 * parseDeliveriesCSV result over a fictional fixture that exercises every
 * documented frequency shape, service-code filtering, the most-recent-start
 * dedup rule, and two-word / hyphenated last names.
 */

import {
  parseFrequency,
  calculateSessions,
  parseDeliveriesCSV,
  DeliveriesParseResult,
} from '@/lib/parsers/deliveries-parser';
import { readFixture } from './fixtures/builders';

/**
 * Serialize a DeliveriesParseResult into a deterministic, snapshot-friendly
 * shape. Dates are rendered from their local Y/M/D components (the same basis
 * parseDate constructs them on) so the snapshot is independent of the runner's
 * timezone. The deliveries Map is emitted as a sorted array of entries.
 */
function serialize(result: DeliveriesParseResult) {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    deliveries: Array.from(result.deliveries.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // locale-independent for stable snapshots
      .map(([key, r]) => ({
        key,
        name: r.name,
        seisId: r.seisId,
        service: r.service,
        startDate: ymd(r.startDate),
        endDate: ymd(r.endDate),
        sessionsFrequency: r.sessionsFrequency,
        weeklyMinutes: r.weeklyMinutes,
        sessionsPerWeek: r.sessionsPerWeek,
        minutesPerSession: r.minutesPerSession,
      })),
    errors: result.errors,
    warnings: result.warnings,
    metadata: result.metadata,
  };
}

describe('parseFrequency', () => {
  it('parses simple weekly/daily/yearly formats', () => {
    expect(parseFrequency('45 min Weekly')).toEqual({ weeklyMinutes: 45, rawMinutes: 45, period: 'weekly' });
    expect(parseFrequency('15 min Weekly')).toEqual({ weeklyMinutes: 15, rawMinutes: 15, period: 'weekly' });
    // Daily multiplies by 5 school days.
    expect(parseFrequency('15 min Daily')).toEqual({ weeklyMinutes: 75, rawMinutes: 15, period: 'daily' });
    // Yearly divides by ~36 instructional weeks and rounds up.
    expect(parseFrequency('300 min Yearly')).toEqual({ weeklyMinutes: 9, rawMinutes: 300, period: 'yearly' });
  });

  it('parses complex "N min x M Times = T min Period" formats', () => {
    expect(parseFrequency('30 min x 5 Times = 150 min Weekly')).toEqual({ weeklyMinutes: 150, rawMinutes: 150, period: 'weekly' });
    // Daily multiplies by 5 school days.
    expect(parseFrequency('60 min x 2 Times = 120 min Daily')).toEqual({ weeklyMinutes: 600, rawMinutes: 120, period: 'daily' });
    expect(parseFrequency('90 min x 3 Times = 270 min Yearly')).toEqual({ weeklyMinutes: 8, rawMinutes: 270, period: 'yearly' });
    expect(parseFrequency('120 min x 6 Times = 720 min Weekly')).toEqual({ weeklyMinutes: 720, rawMinutes: 720, period: 'weekly' });
  });

  it('returns zero for Monthly (currently unparsed) and junk input', () => {
    expect(parseFrequency('120 min Monthly')).toEqual({ weeklyMinutes: 0, rawMinutes: 0, period: '' });
    expect(parseFrequency('')).toEqual({ weeklyMinutes: 0, rawMinutes: 0, period: '' });
    expect(parseFrequency('whenever')).toEqual({ weeklyMinutes: 0, rawMinutes: 0, period: '' });
  });
});

describe('calculateSessions', () => {
  it('keeps exactly 45 weekly minutes as a single 45-minute session', () => {
    expect(calculateSessions(45)).toEqual({ sessionsPerWeek: 1, minutesPerSession: 45 });
  });

  it('schedules a sub-30-minute mandate as one session of exactly that length (no doubling)', () => {
    // Previously these rounded up to 1x30, booking more time than mandated.
    expect(calculateSessions(15)).toEqual({ sessionsPerWeek: 1, minutesPerSession: 15 });
    expect(calculateSessions(20)).toEqual({ sessionsPerWeek: 1, minutesPerSession: 20 });
    expect(calculateSessions(29)).toEqual({ sessionsPerWeek: 1, minutesPerSession: 29 });
  });

  it('breaks 30+ weekly minutes into ceil(n/30) 30-minute sessions', () => {
    expect(calculateSessions(30)).toEqual({ sessionsPerWeek: 1, minutesPerSession: 30 });
    expect(calculateSessions(150)).toEqual({ sessionsPerWeek: 5, minutesPerSession: 30 });
    expect(calculateSessions(600)).toEqual({ sessionsPerWeek: 20, minutesPerSession: 30 });
    expect(calculateSessions(720)).toEqual({ sessionsPerWeek: 24, minutesPerSession: 30 });
  });

  it('returns zero sessions for non-positive minutes', () => {
    expect(calculateSessions(0)).toEqual({ sessionsPerWeek: 0, minutesPerSession: 0 });
    expect(calculateSessions(-30)).toEqual({ sessionsPerWeek: 0, minutesPerSession: 0 });
  });
});

describe('parseDeliveriesCSV', () => {
  const buffer = () => readFixture('deliveries.csv');

  it('matches the golden snapshot for the resource role (330)', async () => {
    const result = await parseDeliveriesCSV(buffer(), { providerRole: 'resource' });
    expect(serialize(result)).toMatchSnapshot();
  });

  it('most-recent start date wins even when it supersedes a higher-minute row', async () => {
    const result = await parseDeliveriesCSV(buffer(), { providerRole: 'resource' });
    const nadia = result.deliveries.get('ng-patel_nadia');
    expect(nadia).toBeDefined();
    // The 09/01 row (30 min Weekly) supersedes the earlier 08/01 720-minute row.
    expect(nadia!.weeklyMinutes).toBe(30);
    expect(nadia!.sessionsFrequency).toBe('30 min Weekly');
  });

  it('psychologist role (no service code) keeps all service rows', async () => {
    const result = await parseDeliveriesCSV(buffer(), { providerRole: 'psychologist' });
    expect(serialize(result)).toMatchSnapshot();
  });
});
