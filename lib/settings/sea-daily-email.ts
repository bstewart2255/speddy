/**
 * SPE-320: shared "same school" matching for the RS → SEA daily-email toggle.
 *
 * The Settings UI (which SEAs an RS sees) and the API (which SEAs an RS may
 * toggle) MUST use the identical rule, so both import from here. An SEA shares
 * an RS's school when their (school_site, school_district) pair matches one of
 * the RS's schools: the RS's own profile school, plus — when the RS works at
 * multiple schools — every site in `provider_schools`.
 */

/**
 * Normalized key for a (site, district) pair. Returns `null` when BOTH are
 * empty so a school-less profile is never matchable — otherwise every empty
 * pair would collapse to the same `"||"` string and an RS with no school on
 * file would match any SEA with no school on file (an authorization leak).
 */
export function schoolKey(
  site: string | null | undefined,
  district: string | null | undefined
): string | null {
  const s = (site ?? '').trim().toLowerCase();
  const d = (district ?? '').trim().toLowerCase();
  if (!s && !d) return null;
  return `${s}||${d}`;
}

export interface ResourceSchoolInput {
  worksAtMultipleSchools: boolean | null;
  schoolSite: string | null;
  schoolDistrict: string | null;
  providerSchools: Array<{
    school_site: string | null;
    school_district: string | null;
  }>;
}

/** The set of (site+district) keys an RS is scoped to (school-less pairs skipped). */
export function resourceSchoolKeys(input: ResourceSchoolInput): Set<string> {
  const keys = new Set<string>();
  const primary = schoolKey(input.schoolSite, input.schoolDistrict);
  if (primary) keys.add(primary);
  if (input.worksAtMultipleSchools) {
    for (const ps of input.providerSchools) {
      const key = schoolKey(ps.school_site, ps.school_district);
      if (key) keys.add(key);
    }
  }
  return keys;
}

export function seaSharesResourceSchool(
  sea: { school_site: string | null; school_district: string | null },
  keys: Set<string>
): boolean {
  const key = schoolKey(sea.school_site, sea.school_district);
  // A school-less SEA (null key) never matches — no false-positive on "||".
  return key !== null && keys.has(key);
}
