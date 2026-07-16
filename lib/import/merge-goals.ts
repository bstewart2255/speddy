/**
 * Merge incoming IEP goals into a student's existing goals — the per-student
 * import semantic (SPE-234), as opposed to the bulk sync's replace.
 *
 * Append-only: an incoming goal is added unless an existing goal already matches
 * it case-insensitively after trimming. Existing goals are never removed or
 * reordered, and incoming goals keep their order. Returns a new array.
 */
export function mergeGoals(existing: string[], incoming: string[]): string[] {
  const merged = [...existing];
  for (const goal of incoming) {
    if (!merged.some(e => e.trim().toLowerCase() === goal.trim().toLowerCase())) {
      merged.push(goal);
    }
  }
  return merged;
}
