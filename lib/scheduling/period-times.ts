/**
 * SPE-513 — resolving period NAMES to clock times against a school's period
 * grid (SPE-491 bell rows).
 *
 * Service-time entries are period-anchored and store no times; every surface
 * that needs clock times (drag warning, auto-scheduler, availability bands)
 * resolves them here so the normalization rule — trimmed, case-insensitive
 * period names; duplicate rows collapse to the earliest start per day —
 * cannot drift between paths. Pure (no I/O), same reasoning as
 * findOverlappingMainstreamingBlock living in one place.
 */

export interface BellRowLite {
  day_of_week: number;
  period_name: string | null;
  start_time: string;
  end_time: string;
}

export interface PeriodTimes {
  start: string;
  end: string;
}

/** The lookup key for one (day, period) cell of the grid. */
export function bellTimesKey(day: number, periodName: string): string {
  return `${day}|${periodName.trim().toLowerCase()}`;
}

/**
 * Collapse bell rows into a (day, period) → times map. Several providers may
 * each have entered the school's grid, so duplicate rows are expected; the
 * earliest-starting row wins per (day, period), deterministically. Days stay
 * separate — a block schedule runs the same period at different times on
 * different days.
 */
export function collapseBellTimes(rows: BellRowLite[]): Map<string, PeriodTimes> {
  const map = new Map<string, PeriodTimes>();
  for (const row of rows) {
    const period = row.period_name?.trim();
    if (!period) continue;
    const key = bellTimesKey(row.day_of_week, period);
    const existing = map.get(key);
    if (!existing || row.start_time < existing.start) {
      map.set(key, { start: row.start_time, end: row.end_time });
    }
  }
  return map;
}

/**
 * Place a free-text period label ("Period 3", "3") onto a school's period
 * list. Labels come from student_teachers.period, which is display-only free
 * text (SPE-334), so this is best-effort: exact trimmed match first, then
 * "Period <label>". Null when nothing matches — the caller leaves its field
 * for the human.
 */
export function resolvePeriodLabel(
  label: string | null | undefined,
  periodOptions: string[]
): string | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const exact = periodOptions.find(p => p.trim().toLowerCase() === lower);
  if (exact) return exact;
  const prefixed = periodOptions.find(
    p => p.trim().toLowerCase() === `period ${lower}`
  );
  return prefixed ?? null;
}
