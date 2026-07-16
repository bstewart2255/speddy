/**
 * Merge incoming IEP goals into a student's existing goals — the per-student
 * import semantic (SPE-234), as opposed to the bulk sync's replace.
 *
 * Append-only: an incoming goal is added unless an existing goal already matches
 * it case-insensitively after trimming. Existing goals are never removed or
 * reordered, and incoming goals keep their order. Returns a new array.
 *
 * Reference spec: the write path now performs this merge atomically in the
 * database (`merge_iep_goals_array` / `merge_iep_goals` RPC, SPE-259) to close a
 * concurrent read-merge-write race. This function is kept as the unit-tested
 * source of truth for the merge rules the SQL mirrors — keep the two in sync.
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
