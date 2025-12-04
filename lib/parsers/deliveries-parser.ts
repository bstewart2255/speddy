/**
 * SEIS Deliveries Parser
 * Parses SEIS Deliveries CSV to extract schedule requirements (sessions per week)
 * for 330 Specialized Academic Instruction services
 */

import { normalizeStudentName } from './name-utils';

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
    filtered330Rows: number;
    uniqueStudents: number;
  };
}

/**
 * Parse frequency string to extract weekly minutes
 * Handles patterns like:
 * - "45 min Weekly"
 * - "60 min x 2 Times = 120 min Weekly"
 * - "60 min x 2 Times = 120 min Daily" (multiply by 5 for weekly)
 * - "300 min Yearly" (divide by 52 for weekly)
 */
export function parseFrequency(frequency: string): { weeklyMinutes: number; rawMinutes: number; period: string } {
  if (!frequency || typeof frequency !== 'string') {
    return { weeklyMinutes: 0, rawMinutes: 0, period: '' };
  }

  const cleaned = frequency.trim();

  // Pattern 1: Simple format "45 min Weekly" or "300 min Yearly"
  const simpleMatch = cleaned.match(/^(\d+)\s*min\s*(Weekly|Daily|Yearly)/i);
  if (simpleMatch) {
    const minutes = parseInt(simpleMatch[1], 10);
    const period = simpleMatch[2].toLowerCase();

    let weeklyMinutes = minutes;
    if (period === 'daily') {
      weeklyMinutes = minutes * 5; // 5 school days
    } else if (period === 'yearly') {
      weeklyMinutes = Math.ceil(minutes / 36); // ~36 instructional weeks in school year
    }

    return { weeklyMinutes, rawMinutes: minutes, period };
  }

  // Pattern 2: Complex format "60 min x 2 Times = 120 min Weekly"
  const complexMatch = cleaned.match(/(\d+)\s*min\s*x\s*(\d+)\s*Times?\s*=\s*(\d+)\s*min\s*(Weekly|Daily|Yearly)/i);
  if (complexMatch) {
    const totalMinutes = parseInt(complexMatch[3], 10);
    const period = complexMatch[4].toLowerCase();

    let weeklyMinutes = totalMinutes;
    if (period === 'daily') {
      weeklyMinutes = totalMinutes * 5; // 5 school days
    } else if (period === 'yearly') {
      weeklyMinutes = Math.ceil(totalMinutes / 36); // ~36 instructional weeks in school year
    }

    return { weeklyMinutes, rawMinutes: totalMinutes, period };
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
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current.trim());

  return result;
}

/**
 * Parse SEIS Deliveries CSV buffer
 */
export async function parseDeliveriesCSV(buffer: Buffer): Promise<DeliveriesParseResult> {
  const content = buffer.toString('utf-8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  const deliveries = new Map<string, DeliveryRecord>();
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];

  let totalRows = 0;
  let filtered330Rows = 0;

  // Expected columns (0-indexed):
  // 0: Name, 1: SEIS ID, 2: Service, 3: Delivery, 4: Start Date, 5: End Date,
  // 6: Sessions / Frequency, 7: Location, 8: Total Minutes, 9: Total Delivered, 10: Medi-Cal

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    totalRows++;
    const rowNum = i + 1;

    try {
      const fields = parseCSVLine(line);

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

      // Filter for 330 Specialized Academic Instruction only
      if (!service.includes('330') || !service.toLowerCase().includes('specialized academic instruction')) {
        continue;
      }

      filtered330Rows++;

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
      const { weeklyMinutes } = parseFrequency(sessionsFrequency);
      if (weeklyMinutes === 0) {
        warnings.push({ row: rowNum, message: `Could not parse frequency: ${sessionsFrequency}` });
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
      filtered330Rows,
      uniqueStudents: deliveries.size
    }
  };
}
