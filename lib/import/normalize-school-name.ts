/**
 * School-name normalization for the student-import matching flow (SPE-230).
 *
 * Extracted verbatim from the app/api/import-students preview route, where it
 * scopes a multi-school provider's parsed students to their currently selected
 * school by comparing normalized school names.
 *
 * INTENTIONALLY DIVERGENT from `normalizeSchoolName` in `lib/school-helpers.ts`:
 * that copy strips punctuation/stopwords but keeps a trailing "school" and does
 * not expand abbreviations; this copy expands common abbreviations (mt -> mount,
 * st -> saint, elem -> elementary) and drops a trailing "school". The two are
 * not interchangeable — `__tests__/unit/lib/parsers/normalization.test.ts` pins
 * the divergence on purpose. Do not merge them.
 *
 * NOTE: "elementary/middle/high" are intentionally kept to distinguish schools
 * like "Washington Elementary" vs "Washington Middle" (different schools).
 *
 * Handles cases where the same school appears with slight variations:
 * - "Mt Diablo Elementary" vs "Mt Diablo Elementary School"
 * - "Bancroft Elementary School" vs "Bancroft Elementary"
 */
export function normalizeSchoolName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Standardize common abbreviations
  normalized = normalized
    .replace(/\bmt\.?\s/g, 'mount ')
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(/\belem\.?\s/g, 'elementary ')
    .replace(/\belem\.?$/g, 'elementary');

  // Only remove trailing "school" word (not elementary/middle/high to preserve school level distinction)
  if (normalized.endsWith(' school')) {
    normalized = normalized.slice(0, -7).trim();
  }

  return normalized;
}
