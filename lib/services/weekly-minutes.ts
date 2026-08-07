/**
 * IEP service-minutes → weekly conversion.
 *
 * One rule everywhere: a school year is 180 instructional days = 36 weeks =
 * 9 school months of 4 weeks. Every stated period converts to minutes/week
 * through that single system, rounding UP so a conversion never suggests
 * under-serving a mandate. Supersedes the SPE-246 "flag Monthly for review"
 * decision — ÷4 is internally consistent with the 36-week year, so Monthly
 * now converts like every other period (product decision 2026-08-07).
 *
 * Secondary schools deliver resource service embedded in class periods
 * (a daily SAI/study-skills period), not as individual pull-outs — so for a
 * resource provider at a secondary school the weekly total stays ONE bucket,
 * stored as sessions_per_week = 1 with the full weekly amount, instead of
 * being chopped into 30-minute sessions. Chopping produced caseloads like
 * "19x/week, 30 min" at the John Swett pilot. Other roles (speech/OT/
 * counseling) still pull out individually at secondary and keep the chop.
 *
 * Pure module — safe to import from client components, parsers, and API
 * routes alike. Keep it dependency-light.
 */

import { isSecondarySchool, type SchoolLevelInput } from '@/lib/school-helpers';

export const SCHOOL_DAYS_PER_WEEK = 5;
export const WEEKS_PER_SCHOOL_MONTH = 4;
export const WEEKS_PER_SCHOOL_YEAR = 36;

/**
 * Storage bounds on students.sessions_per_week / minutes_per_session
 * (check_sessions_per_week, check_minutes_per_session). The minutes cap is
 * sized for a weekly bucket — a full-schedule secondary mandate runs to
 * ~1500 min/week — while still rejecting garbage parses.
 */
export const MAX_SESSIONS_PER_WEEK = 20;
export const MAX_MINUTES_PER_SESSION = 1800;

export type ServicePeriod = 'weekly' | 'daily' | 'monthly' | 'yearly';

/**
 * Convert a total-minutes amount for a given period into weekly minutes.
 * Unrecognized periods return 0 so callers can flag the row for review
 * instead of importing a confident-looking wrong number.
 */
export function toWeeklyMinutes(totalMinutes: number, period: string): number {
  switch (period) {
    case 'daily':
      return totalMinutes * SCHOOL_DAYS_PER_WEEK;
    case 'weekly':
      return totalMinutes;
    case 'monthly':
      return Math.ceil(totalMinutes / WEEKS_PER_SCHOOL_MONTH);
    case 'yearly':
      return Math.ceil(totalMinutes / WEEKS_PER_SCHOOL_YEAR);
    default:
      return 0;
  }
}

export interface SessionSplit {
  sessionsPerWeek: number;
  minutesPerSession: number;
}

/**
 * Shape weekly minutes into a sessions-per-week × minutes-per-session split.
 *
 * Default (elementary pull-out) rules:
 * - exactly 45 min/week stays a single 45-minute session
 * - under 30 min/week stays a single session of exactly that length
 *   (rounding up to a 30-minute session would book more time than the IEP)
 * - otherwise ceil(n/30) thirty-minute sessions
 *
 * `weeklyBucket` (secondary resource): the whole weekly amount is one
 * "session" — a planning bucket, never an actual pull-out block.
 */
export function calculateSessions(
  weeklyMinutes: number,
  opts: { weeklyBucket?: boolean } = {}
): SessionSplit {
  if (weeklyMinutes <= 0) {
    return { sessionsPerWeek: 0, minutesPerSession: 0 };
  }

  if (opts.weeklyBucket) {
    return { sessionsPerWeek: 1, minutesPerSession: weeklyMinutes };
  }

  if (weeklyMinutes === 45) {
    return { sessionsPerWeek: 1, minutesPerSession: 45 };
  }

  if (weeklyMinutes < 30) {
    return { sessionsPerWeek: 1, minutesPerSession: weeklyMinutes };
  }

  return { sessionsPerWeek: Math.ceil(weeklyMinutes / 30), minutesPerSession: 30 };
}

/**
 * Whether a split fits the students-table storage bounds. A split that
 * doesn't (e.g. a garbage yearly total, or an elementary chop past 20
 * sessions) should be flagged for review, not written and refused by the DB.
 */
export function fitsScheduleConstraints(split: SessionSplit): boolean {
  return (
    split.sessionsPerWeek >= 1 &&
    split.sessionsPerWeek <= MAX_SESSIONS_PER_WEEK &&
    split.minutesPerSession >= 1 &&
    split.minutesPerSession <= MAX_MINUTES_PER_SESSION
  );
}

/**
 * The one decision point for the secondary-resource weekly bucket: resource
 * providers at secondary schools plan in minutes/week, everyone else in
 * discrete sessions. Role strings match profiles.role ('resource'); school
 * classification follows isSecondarySchool (school_type, then grade span —
 * K-8/K-12 sites count as elementary by product decision).
 */
export function shouldUseWeeklyBucket(
  providerRole: string | null | undefined,
  school: SchoolLevelInput | null | undefined
): boolean {
  return providerRole?.trim() === 'resource' && isSecondarySchool(school);
}
