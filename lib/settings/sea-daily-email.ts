/**
 * SPE-320: shared "same school" matching for the RS → SEA daily-email toggle.
 *
 * The Settings UI (which SEAs an RS sees) and the API (which SEAs an RS may
 * toggle) MUST use the identical rule, so both import from here. An SEA shares
 * an RS's school when their (school_site, school_district) pair matches one of
 * the RS's schools: the RS's own profile school, plus — when the RS works at
 * multiple schools — every site in `provider_schools`.
 */

export function schoolKey(
  site: string | null | undefined,
  district: string | null | undefined
): string {
  return `${(site ?? '').trim().toLowerCase()}||${(district ?? '').trim().toLowerCase()}`;
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

/** The set of (site+district) keys an RS is scoped to. */
export function resourceSchoolKeys(input: ResourceSchoolInput): Set<string> {
  const keys = new Set<string>();
  keys.add(schoolKey(input.schoolSite, input.schoolDistrict));
  if (input.worksAtMultipleSchools) {
    for (const ps of input.providerSchools) {
      keys.add(schoolKey(ps.school_site, ps.school_district));
    }
  }
  return keys;
}

export function seaSharesResourceSchool(
  sea: { school_site: string | null; school_district: string | null },
  keys: Set<string>
): boolean {
  return keys.has(schoolKey(sea.school_site, sea.school_district));
}
