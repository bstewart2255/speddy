/**
 * Shared utilities for IEP date validation
 */

export interface IepDateWarning {
  type: 'future' | 'stale' | null;
  message: string | null;
}

/**
 * Check IEP date status for validation warnings
 * Returns warning if date is in the future or more than 1 year old
 */
export function getIepDateWarning(iepDate?: string): IepDateWarning {
  if (!iepDate) {
    return { type: null, message: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const iepDateObj = new Date(iepDate + 'T00:00:00');

  // Guard against invalid dates
  if (isNaN(iepDateObj.getTime())) {
    return { type: null, message: null };
  }

  // Future date check
  if (iepDateObj > today) {
    return {
      type: 'future',
      message: 'Goal may not be current - IEP date is in the future'
    };
  }

  // Stale date check (more than 1 year old)
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  if (iepDateObj < oneYearAgo) {
    return {
      type: 'stale',
      message: 'Goals may be outdated - check if these are the most recent'
    };
  }

  return { type: null, message: null };
}

/**
 * Parse a date string into ISO format (YYYY-MM-DD)
 * Handles various date formats from Excel/CSV/SEIS exports including:
 * - ISO format (YYYY-MM-DD)
 * - US format (MM/DD/YYYY)
 * - US dash format (MM-DD-YYYY)
 * - Excel serial dates (numeric values like 45234)
 * - JavaScript Date objects
 */
export function parseDate(dateValue: string | Date | number): string | undefined {
  // Handle Date objects directly
  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) {
      return undefined;
    }
    return dateValue.toISOString().split('T')[0];
  }

  // Handle numbers (Excel serial dates)
  if (typeof dateValue === 'number') {
    return excelSerialToDate(dateValue);
  }

  // Handle strings
  if (!dateValue || typeof dateValue !== 'string' || !dateValue.trim()) {
    return undefined;
  }

  const trimmed = dateValue.trim();

  // Try parsing as ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Try parsing MM/DD/YYYY format
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try parsing MM-DD-YYYY format
  const usDashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (usDashMatch) {
    const [, month, day, year] = usDashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Check if it's a numeric-only string (Excel serial date)
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (Number.isFinite(serial) && serial > 0) {
      return excelSerialToDate(serial);
    }
  }

  // Try parsing full ISO datetime format (YYYY-MM-DDTHH:MM:SS)
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    try {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return undefined;
}

/**
 * Convert Excel serial date to ISO date string
 * Excel's epoch is 1899-12-30 (day 0 = Dec 30, 1899)
 * Note: Excel has a bug where it treats 1900 as a leap year, so we account for that
 */
function excelSerialToDate(serial: number): string | undefined {
  if (!Number.isFinite(serial) || serial < 1) {
    return undefined;
  }

  // Excel's epoch: January 1, 1900 is day 1
  // But Excel has a bug treating 1900 as a leap year
  // So dates after Feb 28, 1900 need adjustment
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Dec 30, 1899
  const days = Math.floor(serial);

  // Add the days to the epoch
  const resultDate = new Date(excelEpoch);
  resultDate.setUTCDate(resultDate.getUTCDate() + days);

  // Validate the result is a reasonable date (between 1900 and 2100)
  const year = resultDate.getUTCFullYear();
  if (year < 1900 || year > 2100) {
    return undefined;
  }

  return resultDate.toISOString().split('T')[0];
}
