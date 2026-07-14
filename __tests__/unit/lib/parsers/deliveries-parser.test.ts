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
import { readFixture, DELIVERIES_EMBEDDED_NEWLINE_CSV } from './fixtures/builders';

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

describe('parseDeliveriesCSV — newline inside a quoted field', () => {
  it('keeps a row with an embedded newline as one row (no split) and imports it', async () => {
    const result = await parseDeliveriesCSV(DELIVERIES_EMBEDDED_NEWLINE_CSV(), { providerRole: 'resource' });

    // One clean row, not a valid row plus an orphaned fragment.
    expect(result.deliveries.size).toBe(1);
    expect(result.metadata.totalRows).toBe(1);

    const delivery = Array.from(result.deliveries.values())[0];
    expect(delivery.name).toBe('Young, Yara');
    expect(delivery.sessionsFrequency).toBe('30 min Weekly');
    expect(delivery.weeklyMinutes).toBe(30);

    // The old split(/\r?\n/) reader would have cut the quoted Location in two and
    // warned "fewer than expected columns" on the "(Portable B)",... remainder.
    expect(result.warnings.some((w) => /fewer than expected columns/i.test(w.message))).toBe(false);
  });
});

describe('parseDeliveriesCSV — malformed quote in one row', () => {
  it('parses leniently so one stray quote does not discard the whole file', async () => {
    // A bare double-quote inside an unquoted field makes csv-parse throw unless
    // relaxed; a throw here would zero out the entire caseload.
    const csv = Buffer.from(
      [
        'Name,SEIS ID,Service,Delivery,Start Date,End Date,Sessions / Frequency,Location,Total Minutes (min/year),Total Delivered,Medi-Cal Billing Consent',
        '"Alvarez, Ana",2000001,330 - Specialized Academic Instruction,Direct,08/15/2025,06/10/2026,45 min Weekly,Room 1,1620,0,Yes',
        'Ort"iz Omar,2000030,330 - Specialized Academic Instruction,Direct,08/15/2025,06/10/2026,30 min Weekly,Room 2,1080,0,No',
        '"Bishop, Ben",2000002,330 - Specialized Academic Instruction,Direct,08/15/2025,06/10/2026,30 min x 5 Times = 150 min Weekly,Room 3,5400,0,Yes',
      ].join('\r\n'),
      'utf-8',
    );
    const result = await parseDeliveriesCSV(csv, { providerRole: 'resource' });

    // The well-formed rows still import — a stray quote must not zero out the
    // whole caseload the way a throwing parser would.
    expect(result.deliveries.has('alvarez_ana')).toBe(true);
    expect(result.deliveries.has('bishop_ben')).toBe(true);
    expect(result.errors.some((e) => /failed to parse csv/i.test(e.message))).toBe(false);
  });
});

describe('parseDeliveriesCSV — blank-line handling parity', () => {
  it('drops a whitespace-only line but keeps and warns on a comma-only row', async () => {
    const csv = Buffer.from(
      [
        'Name,SEIS ID,Service,Delivery,Start Date,End Date,Sessions / Frequency,Location,Total Minutes (min/year),Total Delivered,Medi-Cal Billing Consent',
        '   ', // whitespace-only line — dropped before numbering, like the old reader
        ',,,', // short comma row — kept and surfaced as a short row, not silently dropped
        '"Alvarez, Ana",2000001,330 - Specialized Academic Instruction,Direct,08/15/2025,06/10/2026,45 min Weekly,Room 1,1620,0,Yes',
      ].join('\r\n'),
      'utf-8',
    );
    const result = await parseDeliveriesCSV(csv, { providerRole: 'resource' });

    expect(result.deliveries.has('alvarez_ana')).toBe(true);
    expect(result.warnings.some((w) => /fewer than expected columns/i.test(w.message))).toBe(true);
  });
});

describe('parseDeliveriesCSV — unrecoverable parse failure', () => {
  it('propagates the error so the caller surfaces it, instead of importing zero rows silently', async () => {
    // An opening quote that never closes runs to EOF (CSV_QUOTE_NOT_CLOSED),
    // which relax_quotes does not recover. The import route catches this and
    // surfaces it (400 / warning); swallowing it into an ignored errors array
    // would hide a total-loss failure.
    const csv = Buffer.from(
      [
        'Name,SEIS ID,Service,Delivery,Start Date,End Date,Sessions / Frequency,Location,Total Minutes (min/year),Total Delivered,Medi-Cal Billing Consent',
        '"Doe, Jane,2000040,330 - Specialized Academic Instruction,Direct,08/15/2025,06/10/2026,30 min Weekly,Room 1,1080,0,Yes',
      ].join('\r\n'),
      'utf-8',
    );
    await expect(parseDeliveriesCSV(csv, { providerRole: 'resource' })).rejects.toThrow();
  });
});
