/**
 * Type definitions for school information and related structures
 *
 * These types handle both current and legacy field names for school data,
 * supporting migration from old schema to new schema.
 */

/**
 * Minimal interface for school information that supports both current and legacy field names
 *
 * This type is used during the migration period where both old field names
 * (site, district) and new field names (school_site, school_district) may exist.
 *
 * @example
 * ```typescript
 * const site = getSchoolSite(currentSchool);
 * const district = getSchoolDistrict(currentSchool);
 * ```
 */
export interface SchoolInfoBase {
  // Current field names
  school_site?: string | null;
  school_district?: string | null;
  school_id?: string | null;
  district_id?: string | null;

  // Legacy field names (from older schema)
  /** @deprecated Use school_site instead */
  site?: string | null;
  /** @deprecated Use school_district instead */
  district?: string | null;
}

/**
 * Safely get school site from a SchoolInfo object, checking both current and legacy fields
 *
 * @param school - School information object
 * @returns The school site name, or null if not found
 */
export function getSchoolSite(school: SchoolInfoBase | null | undefined): string | null {
  if (!school) return null;
  return school.school_site ?? school.site ?? null;
}

/**
 * Safely get school district from a SchoolInfo object, checking both current and legacy fields
 *
 * @param school - School information object
 * @returns The school district name, or null if not found
 */
export function getSchoolDistrict(school: SchoolInfoBase | null | undefined): string | null {
  if (!school) return null;
  return school.school_district ?? school.district ?? null;
}

/**
 * Safely get school ID from a SchoolInfo object
 *
 * @param school - School information object
 * @returns The school ID, or null if not found
 */
export function getSchoolId(school: SchoolInfoBase | null | undefined): string | null {
  if (!school) return null;
  return school.school_id ?? null;
}

/**
 * Safely get district ID from a SchoolInfo object
 *
 * @param school - School information object
 * @returns The district ID, or null if not found
 */
export function getDistrictId(school: SchoolInfoBase | null | undefined): string | null {
  if (!school) return null;
  return school.district_id ?? null;
}

/**
 * Check if school has complete location information
 *
 * @param school - School information object
 * @returns True if both site and district are available
 */
export function hasCompleteSchoolInfo(school: SchoolInfoBase | null | undefined): boolean {
  if (!school) return false;
  const site = getSchoolSite(school);
  const district = getSchoolDistrict(school);
  return Boolean(site && district);
}
