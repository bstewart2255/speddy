/**
 * SEIS Deliveries Parser
 * Parses SEIS Deliveries CSV to extract schedule requirements (sessions per week)
 * for service type codes based on provider role
 */

import { parse } from 'csv-parse/sync';
import { normalizeStudentName } from './name-utils';
import { isServiceCodeForRole, getServiceTypeCode } from './service-type-mapping';

export interface DeliveryRecord {
  normalizedName: string;
  name: string;
  seisId: string;
  service: string;
  startDate: Date;
  endDate: Date;
  sessionsFrequency: string;
  weeklyMinutes: number;
  sessionsPerWeek: number;
  minutesPerSession: number;
}

export interface DeliveriesParseResult {
  deliveries: Map<string, DeliveryRecord>; // Keyed by normalized name
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  metadata: {
    totalRows: number;
    filteredServiceRows: number;
    uniqueStudents: number;
    serviceTypeCode: string | null;
  };
}

export interface DeliveriesParseOptions {
  providerRole?: string; // Provider's role for service type filtering (resource, speech, ot, counseling)
}

/**
 * Convert a total-minutes amount for a given period into weekly minutes.
 *
 * `monthly` deliberately returns 0: a monthly total has no unambiguous weekly
 * conversion (a school month is ~4 weeks by some rules, ~4.33 by others), and
 * these drive compliance-relevant service minutes — so the caller flags the row
 * for manual review instead of guessing a confident-looking wrong number
 * (SPE-246, Option C). The recognized `period` is still returned so the caller
 * can distinguish a Monthly row from truly unparseable junk.
 */
function toWeeklyMinutes(totalMinutes: number, period: string): number {
  switch (period) {
    case 'daily':
      return totalMinutes * 5; // 5 school days
    case 'yearly':
      return Math.ceil(totalMinutes / 36); // ~36 instructional weeks in school year
    case 'weekly':
      return totalMinutes;
    case 'monthly':
    default:
      return 0; // needs review — don't guess a compliance number
  }
}

// "minutes" is spelled several ways in real SEIS exports: "min", "mins",
// "minute", "minutes". Match any of them. Compiled once at module load (not per
// call) since the same three shapes are matched for every row.
const MIN_UNIT = 'min(?:ute)?s?';
const PERIOD = '(Weekly|Daily|Yearly|Monthly)';
// Reversed "count x length", e.g. "2 x 30 min Weekly".
const FREQ_REVERSED = new RegExp(`^(\\d+)\\s*x\\s*(\\d+)\\s*${MIN_UNIT}\\s*${PERIOD}`, 'i');
// Complex "N min x M Times = T min Period".
const FREQ_COMPLEX = new RegExp(`(\\d+)\\s*${MIN_UNIT}\\s*x\\s*(\\d+)\\s*Times?\\s*=\\s*(\\d+)\\s*${MIN_UNIT}\\s*${PERIOD}`, 'i');
// Simple "N min Period", incl. spelled-out unit.
const FREQ_SIMPLE = new RegExp(`^(\\d+)\\s*${MIN_UNIT}\\s*${PERIOD}`, 'i');

/**
 * Parse frequency string to extract weekly minutes
 * Handles patterns like:
 * - "45 min Weekly" / "30 minutes Weekly" (spelled-out unit)
 * - "60 min x 2 Times = 120 min Weekly"
 * - "60 min x 2 Times = 120 min Daily" (multiply by 5 for weekly)
 * - "300 min Yearly" (divide by ~36 instructional weeks)
 * - "2 x 30 min Weekly" (reversed "count x length" order)
 * - "120 min Monthly" (recognized but returned as weekly 0 → flagged for review)
 */
export function parseFrequency(frequency: string): { weeklyMinutes: number; rawMinutes: number; period: string } {
  if (!frequency || typeof frequency !== 'string') {
    return { weeklyMinutes: 0, rawMinutes: 0, period: '' };
  }

  const cleaned = frequency.trim();

  // Pattern 1: Reversed "count x length" order, e.g. "2 x 30 min Weekly".
  // Checked first so its leading "<n> x" isn't mistaken for a bare count. It
  // cannot collide with the "= " complex form, which starts "<n> min x".
  const reversedMatch = cleaned.match(FREQ_REVERSED);
  if (reversedMatch) {
    const total = parseInt(reversedMatch[1], 10) * parseInt(reversedMatch[2], 10);
    const period = reversedMatch[3].toLowerCase();
    return { weeklyMinutes: toWeeklyMinutes(total, period), rawMinutes: total, period };
  }

  // Pattern 2: Complex format "60 min x 2 Times = 120 min Weekly"
  const complexMatch = cleaned.match(FREQ_COMPLEX);
  if (complexMatch) {
    const totalMinutes = parseInt(complexMatch[3], 10);
    const period = complexMatch[4].toLowerCase();
    return { weeklyMinutes: toWeeklyMinutes(totalMinutes, period), rawMinutes: totalMinutes, period };
  }

  // Pattern 3: Simple format "45 min Weekly", "30 minutes Weekly", "300 min Yearly"
  const simpleMatch = cleaned.match(FREQ_SIMPLE);
  if (simpleMatch) {
    const minutes = parseInt(simpleMatch[1], 10);
    const period = simpleMatch[2].toLowerCase();
    return { weeklyMinutes: toWeeklyMinutes(minutes, period), rawMinutes: minutes, period };
  }

  // If we can't parse, return 0
  return { weeklyMinutes: 0, rawMinutes: 0, period: '' };
}

/**
 * Calculate sessions per week and minutes per session from weekly minutes
 * Rules:
 * - If 45 min weekly and only 1 session, keep as 45 min session
 * - Otherwise, break into 30 min sessions
 */
export function calculateSessions(weeklyMinutes: number): { sessionsPerWeek: number; minutesPerSession: number } {
  if (weeklyMinutes <= 0) {
    return { sessionsPerWeek: 0, minutesPerSession: 0 };
  }

  // Special case: exactly 45 minutes per week = 1 session of 45 min
  if (weeklyMinutes === 45) {
    return { sessionsPerWeek: 1, minutesPerSession: 45 };
  }

  // Sub-30-minute mandates are a single session of exactly that length. The
  // default `ceil(n / 30)` path would round these up to a full 30-minute
  // session (e.g. a 15 min/week mandate scheduled as 30 min/week), booking
  // more service time than the IEP requires.
  if (weeklyMinutes < 30) {
    return { sessionsPerWeek: 1, minutesPerSession: weeklyMinutes };
  }

  // Default: 30-minute sessions
  const sessionsPerWeek = Math.ceil(weeklyMinutes / 30);
  return { sessionsPerWeek, minutesPerSession: 30 };
}

/**
 * Parse date from MM/DD/YYYY format
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const match = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const month = parseInt(match[1], 10) - 1; // JS months are 0-indexed
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  const date = new Date(year, month, day);

  // Validate the date is valid
  if (isNaN(date.getTime())) return null;

  return date;
}

/**
 * Parse SEIS Deliveries CSV buffer
 * @param buffer - The CSV file buffer
 * @param options - Options including providerRole for service type filtering
 */
export async function parseDeliveriesCSV(
  buffer: Buffer,
  options: DeliveriesParseOptions = {}
): Promise<DeliveriesParseResult> {
  const deliveries = new Map<string, DeliveryRecord>();
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];

  // Get the service type code for the provider's role
  const providerRole = options.providerRole || 'resource';
  const serviceTypeCode = getServiceTypeCode(providerRole);

  let totalRows = 0;
  let filteredServiceRows = 0;

  // Parse with csv-parse so newlines inside quoted fields don't split one row
  // into several. The previous split(/\r?\n/) + hand-rolled field parser broke
  // any row whose quoted field (e.g. a multi-line note) contained a line break.
  //
  // relax_quotes keeps a single stray/unbalanced quote in one row from
  // discarding the rest of the file. A HARD parse failure (e.g. an unterminated
  // quote that runs to EOF) is intentionally NOT caught here: it propagates to
  // the caller, which surfaces it as an error. Swallowing it into the returned
  // `errors` would import zero schedules silently, because callers only render
  // `warnings`.
  const allRecords: string[][] = parse(buffer, {
    encoding: 'utf-8',
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
  });

  // csv-parse's skip_empty_lines only drops truly-empty lines; the previous
  // reader also dropped whitespace-only lines BEFORE numbering rows. Such a line
  // parses to a single blank field — drop those here so warning/error row
  // numbers stay aligned with the old behavior (a comma-bearing row like ",,,"
  // is kept and still warned on as a short row).
  const records = allRecords.filter((r) => !(r.length === 1 && !r[0].trim()));

  // Expected columns (0-indexed):
  // 0: Name, 1: SEIS ID, 2: Service, 3: Delivery, 4: Start Date, 5: End Date,
  // 6: Sessions / Frequency, 7: Location, 8: Total Minutes, 9: Total Delivered, 10: Medi-Cal

  // Skip header row
  for (let i = 1; i < records.length; i++) {
    const fields = records[i];

    totalRows++;
    const rowNum = i + 1;

    try {
      if (fields.length < 7) {
        warnings.push({ row: rowNum, message: 'Row has fewer than expected columns' });
        continue;
      }

      const name = fields[0].replace(/^["']|["']$/g, '').trim();
      const seisId = fields[1].trim();
      const service = fields[2].trim();
      const startDateStr = fields[4].trim();
      const endDateStr = fields[5].trim();
      const sessionsFrequency = fields[6].trim();

      // Filter by service type code based on provider role
      if (!isServiceCodeForRole(service, providerRole)) {
        continue;
      }

      filteredServiceRows++;

      // Parse start date
      const startDate = parseDate(startDateStr);
      if (!startDate) {
        warnings.push({ row: rowNum, message: `Invalid start date: ${startDateStr}` });
        continue;
      }

      // Parse end date
      const endDate = parseDate(endDateStr);
      if (!endDate) {
        warnings.push({ row: rowNum, message: `Invalid end date: ${endDateStr}` });
        continue;
      }

      // Parse frequency
      const { weeklyMinutes, period, rawMinutes } = parseFrequency(sessionsFrequency);
      if (weeklyMinutes === 0) {
        // Option C (SPE-246): parse the unambiguous formats, but flag the ones
        // whose weekly conversion we'd have to guess. A confident-looking wrong
        // service-minutes number is worse than an explicit "please verify".
        if (period === 'monthly') {
          warnings.push({
            row: rowNum,
            message: `Monthly service (${rawMinutes} min/month) needs review — enter the weekly minutes manually: ${sessionsFrequency}`,
          });
        } else {
          // Unrecognized frequency. If the row still carries a yearly total,
          // surface that number for review instead of importing zero silently.
          const yearlyTotal =
            fields.length > 8 ? parseInt(fields[8].replace(/[^\d]/g, ''), 10) : NaN;
          if (Number.isFinite(yearlyTotal) && yearlyTotal > 0) {
            warnings.push({
              row: rowNum,
              message: `Frequency "${sessionsFrequency}" not recognized; yearly total is ${yearlyTotal} min — needs review, enter the weekly minutes manually.`,
            });
          } else {
            warnings.push({ row: rowNum, message: `Could not parse frequency: ${sessionsFrequency}` });
          }
        }
        continue;
      }

      // Calculate sessions
      const { sessionsPerWeek, minutesPerSession } = calculateSessions(weeklyMinutes);

      // Normalize student name for matching
      const normalizedName = normalizeStudentName(name);
      if (!normalizedName) {
        warnings.push({ row: rowNum, message: `Could not normalize name: ${name}` });
        continue;
      }

      const record: DeliveryRecord = {
        normalizedName,
        name,
        seisId,
        service,
        startDate,
        endDate,
        sessionsFrequency,
        weeklyMinutes,
        sessionsPerWeek,
        minutesPerSession
      };

      // Check if we already have a record for this student
      const existing = deliveries.get(normalizedName);
      if (existing) {
        // Use the one with the most recent start date
        if (startDate > existing.startDate) {
          deliveries.set(normalizedName, record);
        }
        // If same start date, keep the one with more minutes
        else if (startDate.getTime() === existing.startDate.getTime() && weeklyMinutes > existing.weeklyMinutes) {
          deliveries.set(normalizedName, record);
        }
      } else {
        deliveries.set(normalizedName, record);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ row: rowNum, message: `Error parsing row: ${message}` });
    }
  }

  return {
    deliveries,
    errors,
    warnings,
    metadata: {
      totalRows,
      filteredServiceRows,
      uniqueStudents: deliveries.size,
      serviceTypeCode
    }
  };
}
