/**
 * Escape a string so it can be embedded literally inside a `RegExp`.
 *
 * Consolidated from four previously duplicated copies (SPE-249):
 * `lib/parsers/service-type-mapping.ts`, `lib/utils/ai-lesson-formatter.ts`,
 * `lib/lessons/validator.ts`, and `lib/utils/subject-classifier.ts`.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
