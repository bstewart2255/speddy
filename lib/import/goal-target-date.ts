/**
 * Best-effort parse of an IEP goal's *target date* from its free text (SPE-267).
 *
 * SEIS goal statements typically open "By <date>, <student> will …". SEIS
 * exports sometimes still carry goals whose target date is already in the past
 * (an expired goal left in the IEP); the import review uses this to leave those
 * goals unchecked by default so a provider opts in consciously rather than
 * silently re-importing stale goals.
 *
 * The parser is deliberately conservative: it recognizes a few common shapes and
 * returns `null` when nothing is confidently parseable, so the caller keeps the
 * goal selected (we only ever *demote* a goal on a date we're sure of). A month
 * with no day resolves to the LAST day of that month, so a goal isn't treated as
 * expired until the whole month has passed.
 *
 * All matching is on the raw goal text; no PII is stored or logged here.
 */

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/** Last calendar day of a month (handles leap Februaries). */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Build a Date only when the components form a real calendar date. */
function makeDate(year: number, monthIndex: number, day: number): Date | null {
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > lastDayOfMonth(year, monthIndex)) return null;
  return new Date(year, monthIndex, day);
}

export function parseGoalTargetDate(text: string | null | undefined): Date | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 1) Numeric M/D/YYYY, e.g. "by 5/1/2027". Require a 4-digit year: a 2- or
  //    3-digit year is ambiguous (a typo like "5/1/202" would resolve to year
  //    202 and wrongly expire a current goal), and we only demote a goal on a
  //    date we're sure of — so an ambiguous year stays selected.
  const numeric = lower.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (numeric) {
    const d = makeDate(parseInt(numeric[3], 10), parseInt(numeric[1], 10) - 1, parseInt(numeric[2], 10));
    if (d) return d;
  }

  // 2) Month name + optional day + 4-digit year, e.g. "April 2026" or "Apr 5, 2026".
  const named = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{4})\b/,
  );
  if (named) {
    const monthIndex = MONTHS[named[1]];
    if (monthIndex !== undefined) {
      const year = parseInt(named[3], 10);
      const day = named[2] ? parseInt(named[2], 10) : lastDayOfMonth(year, monthIndex);
      const d = makeDate(year, monthIndex, day);
      if (d) return d;
    }
  }

  // 3) Numeric month/year with no day, e.g. "by 5/2027" → end of that month.
  //    The leading `(?:^|[^\d/])` guard stops this from matching the `D/YYYY`
  //    tail of a malformed `M/D/YYYY` (e.g. "13/1/2026" must stay unparsed, not
  //    become Jan 2026): pattern 1 already consumed any real M/D/YYYY, so a slash
  //    immediately before the month here means we're on the tail of a bad date,
  //    not a standalone M/YYYY. (A lookbehind would be cleaner but isn't supported
  //    on older Safari, and this parser runs client-side.)
  const monthYear = lower.match(/(?:^|[^\d/])(\d{1,2})\/(\d{4})\b/);
  if (monthYear) {
    const monthIndex = parseInt(monthYear[1], 10) - 1;
    const year = parseInt(monthYear[2], 10);
    const d = makeDate(year, monthIndex, lastDayOfMonth(year, monthIndex));
    if (d) return d;
  }

  return null;
}

/**
 * True only when a goal's target date parses AND falls strictly before `now`'s
 * calendar day. An unparseable date returns `false` (the goal stays selected).
 */
export function isGoalTargetDatePast(text: string | null | undefined, now: Date): boolean {
  const target = parseGoalTargetDate(text);
  if (!target) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return target.getTime() < today.getTime();
}
