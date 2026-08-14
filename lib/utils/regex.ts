/**
 * Escape a string so it can be embedded literally inside a `RegExp`.
 *
 * Consolidated from previously duplicated copies (SPE-249).
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
