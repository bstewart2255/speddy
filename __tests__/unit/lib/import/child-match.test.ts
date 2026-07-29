/**
 * SPE-348: the "same child?" offer attached to a preview.
 *
 * The matching itself is SQL (one ladder, shared with the write-time
 * re-validation), so what needs pinning here is the plumbing around it: which
 * rows are asked about, that answers land on the right row, that nothing is
 * offered on a shape we don't recognize, and that a failed lookup degrades to
 * today's behaviour instead of breaking the import.
 */

import { attachChildMatches } from '@/lib/import/child-match';
import type { ImportSupabaseClient, StudentPreview } from '@/lib/import/preview-types';

jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const preview = (over: Partial<StudentPreview> = {}): StudentPreview => ({
  firstName: 'Maya',
  lastName: 'Gonzalez',
  initials: 'MG',
  gradeLevel: '5',
  goals: [],
  action: 'insert',
  ...over,
});

/** A stub client whose rpc() records its args and returns a canned payload. */
function stubClient(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { client: { rpc } as unknown as ImportSupabaseClient, rpc };
}

const run = (previews: StudentPreview[], client: ImportSupabaseClient, schoolId: string | null = 'school-1') =>
  attachChildMatches({ supabase: client, userId: 'provider-1', schoolId, previews });

describe('attachChildMatches (SPE-348)', () => {
  it('asks only about insert rows, and maps answers back by position', async () => {
    const previews = [
      preview({ action: 'update', firstName: 'Existing', lastName: 'Student' }),
      preview({ firstName: 'Maya', lastName: 'Gonzalez' }),
      preview({ action: 'skip', firstName: 'Skipped', lastName: 'Row' }),
      preview({ firstName: 'Noah', lastName: 'Park', initials: 'NP' }),
    ];
    const { client, rpc } = stubClient({
      // Answer only the SECOND asked row (idx 1 = previews[3]).
      data: [{ idx: 1, childId: 'child-noah', reason: 'name-grade', gradeLevel: '5' }],
    });

    await run(previews, client);

    // Only the two inserts were asked about, renumbered 0..1.
    const rows = rpc.mock.calls[0][1].p_rows;
    expect(rpc).toHaveBeenCalledWith('find_shared_child_candidates', {
      p_school_id: 'school-1',
      p_rows: expect.any(Array),
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { idx: number; lastName: string }) => [r.idx, r.lastName])).toEqual([
      [0, 'Gonzalez'],
      [1, 'Park'],
    ]);

    // The answer landed on previews[3], not previews[1].
    expect(previews[3].childMatch).toMatchObject({ childId: 'child-noah', reason: 'name-grade' });
    expect(previews[1].childMatch).toBeUndefined();
    // Non-insert rows are never touched — an offer there would be a merge.
    expect(previews[0].childMatch).toBeUndefined();
    expect(previews[2].childMatch).toBeUndefined();
  });

  it('carries the offer detail the review copy needs', async () => {
    const previews = [preview()];
    const { client } = stubClient({
      data: [
        {
          idx: 0,
          childId: 'child-1',
          reason: 'district-student-id',
          gradeLevel: '5',
          districtStudentId: '100482',
          providerName: 'Emily Chen',
          providerRole: 'speech',
        },
      ],
    });

    await run(previews, client);

    expect(previews[0].childMatch).toEqual({
      childId: 'child-1',
      reason: 'district-student-id',
      gradeLevel: '5',
      districtStudentId: '100482',
      providerName: 'Emily Chen',
      providerRole: 'speech',
    });
    expect(previews[0].childMatchConflict).toBeUndefined();
  });

  it('records a conflict as a conflict — never as an offer', async () => {
    const previews = [preview(), preview({ initials: 'NP' })];
    const { client } = stubClient({
      data: [
        { idx: 0, conflict: 'ambiguous', count: 2 },
        { idx: 1, conflict: 'id-name-disagreement' },
      ],
    });

    await run(previews, client);

    expect(previews[0].childMatch).toBeUndefined();
    expect(previews[0].childMatchConflict).toEqual({ kind: 'ambiguous', count: 2 });
    expect(previews[1].childMatch).toBeUndefined();
    expect(previews[1].childMatchConflict).toEqual({ kind: 'id-name-disagreement', count: undefined });
  });

  it('ignores an entry it does not understand rather than rendering a blank prompt', async () => {
    const previews = [preview(), preview({ initials: 'NP' }), preview({ initials: 'AB' })];
    const { client } = stubClient({
      data: [
        { idx: 0, childId: 'child-1', reason: 'vibes' }, // unknown rung
        { idx: 1, reason: 'name-grade' }, // no child id
        { idx: 2, conflict: 'something-else' }, // unknown conflict
      ],
    });

    await run(previews, client);

    expect(previews.every((p) => p.childMatch === undefined)).toBe(true);
    expect(previews.every((p) => p.childMatchConflict === undefined)).toBe(true);
  });

  it('ignores an answer for a row that was never asked about', async () => {
    const previews = [preview()];
    const { client } = stubClient({ data: [{ idx: 7, childId: 'child-x', reason: 'name-grade' }] });

    await expect(run(previews, client)).resolves.toBeUndefined();
    expect(previews[0].childMatch).toBeUndefined();
  });

  it('degrades to no offers when the lookup fails — the import still proceeds', async () => {
    const previews = [preview()];
    const { client } = stubClient({ error: { message: 'boom' } });

    await run(previews, client);

    expect(previews[0].childMatch).toBeUndefined();
    expect(previews[0].childMatchConflict).toBeUndefined();
  });

  it('does not call the RPC with no school (the ladder is school-scoped) or no inserts', async () => {
    const noSchool = stubClient({ data: [] });
    await run([preview()], noSchool.client, null);
    expect(noSchool.rpc).not.toHaveBeenCalled();

    const noInserts = stubClient({ data: [] });
    await run([preview({ action: 'update' }), preview({ action: 'skip' })], noInserts.client);
    expect(noInserts.rpc).not.toHaveBeenCalled();
  });

  it('does not claim a child with a disputed Student ID (SPE-339 withholds it)', async () => {
    // The preview drops a conflicting id, so nothing here should resurrect it.
    const previews = [preview({ districtStudentIdConflict: { districtStudentId: '100482', existingLabel: 'Other Kid' } })];
    const { client, rpc } = stubClient({ data: [] });

    await run(previews, client);

    expect(rpc.mock.calls[0][1].p_rows[0].districtStudentId).toBeNull();
  });
});
