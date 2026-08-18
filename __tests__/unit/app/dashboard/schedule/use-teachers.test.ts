/**
 * @jest-environment jsdom
 */

/**
 * SPE-519: useTeachers used to decide whether to scope its query to the
 * caller's school by asking a *global* question — "does any teacher anywhere in
 * the table have a school_id?" — and skipping the filter when the answer was
 * no. In an un-normalized environment (a fresh seed, a restored snapshot, a
 * newly onboarded district) that handed the caller every school's teachers.
 *
 * These tests pin the scoping to the caller's own school regardless of what the
 * rest of the table looks like. All data is fictional.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTeachers } from '@/app/(dashboard)/dashboard/schedule/hooks/useTeachers';

// The hook starts at [] and queries nothing, so asserting "empty" on the first
// tick passes whether or not the code under test ever ran. Drain the microtask
// queue past the auth await first, so these assertions describe a settled fetch.
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

interface TeacherRow {
  id: string;
  last_name: string;
  school_id: string | null;
}

function makeSupabase(rows: TeacherRow[]) {
  const fromCalls: string[] = [];
  const filters: Array<[string, unknown]> = [];

  const client = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'provider-1' } } }),
    },
    from: (table: string) => {
      fromCalls.push(table);
      const builder: Record<string, (...args: never[]) => unknown> = {
        select: () => builder,
        eq: ((column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        }) as never,
        order: () =>
          Promise.resolve({
            data: rows.filter((row) =>
              filters.every(([column, value]) => row[column as keyof TeacherRow] === value)
            ),
            error: null,
          }),
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, fromCalls, filters };
}

describe('useTeachers — per-school scoping (SPE-519)', () => {
  it('returns only the caller school\'s teachers', async () => {
    const rows: TeacherRow[] = [
      { id: 't1', last_name: 'Alvarez', school_id: 'school-1' },
      { id: 't2', last_name: 'Booker', school_id: 'school-2' },
    ];
    const { client } = makeSupabase(rows);

    const { result } = renderHook(() => useTeachers(client, { school_id: 'school-1' }));

    await waitFor(() => expect(result.current).toEqual([rows[0]]));
  });

  it('still scopes to the caller school when no teacher row is normalized', async () => {
    // The condition that used to disarm the filter: not one school_id in the
    // table. The honest answer for this school is "no teachers", not "everyone".
    const rows: TeacherRow[] = [
      { id: 't1', last_name: 'Alvarez', school_id: null },
      { id: 't2', last_name: 'Booker', school_id: null },
    ];
    const { client, filters } = makeSupabase(rows);

    const { result } = renderHook(() => useTeachers(client, { school_id: 'school-1' }));

    await waitFor(() => expect(filters).toEqual([['school_id', 'school-1']]));
    await waitFor(() => expect(result.current).toEqual([]));
  });

  // Pins the fallback SPE-519 deliberately left in place rather than the one it
  // removed: with no school to scope to, the query stays unfiltered and RLS is
  // the only bound. SPE-544 decides whether that becomes an empty list — and
  // will have to change this test on purpose to do it.
  it.each([
    ['a school with no school_id', { school_id: null }],
    ['no school at all', null],
  ])('reads unfiltered given %s', async (_label, currentSchool) => {
    const rows: TeacherRow[] = [
      { id: 't1', last_name: 'Alvarez', school_id: 'school-1' },
      { id: 't2', last_name: 'Booker', school_id: 'school-2' },
    ];
    const { client, filters } = makeSupabase(rows);

    const { result } = renderHook(() => useTeachers(client, currentSchool));
    await settle();

    expect(filters).toEqual([]);
    expect(result.current).toEqual(rows);
  });

  it('reads the teachers table once — the global school_id probe is gone', async () => {
    const rows: TeacherRow[] = [{ id: 't1', last_name: 'Alvarez', school_id: 'school-1' }];
    const { client, fromCalls } = makeSupabase(rows);

    const { result } = renderHook(() => useTeachers(client, { school_id: 'school-1' }));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(fromCalls).toEqual(['teachers']);
  });

  it('returns an empty list without querying when the caller is signed out', async () => {
    const rows: TeacherRow[] = [{ id: 't1', last_name: 'Alvarez', school_id: 'school-1' }];
    const { client, fromCalls } = makeSupabase(rows);
    const signedOut = {
      ...client,
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    } as unknown as SupabaseClient;

    // Control: the same fixture and the same settle window do reach the table
    // when signed in, so an empty fromCalls below means the guard fired rather
    // than that the fetch had not started yet.
    const { result: signedIn } = renderHook(() => useTeachers(client, { school_id: 'school-1' }));
    await settle();
    expect(fromCalls).toEqual(['teachers']);
    expect(signedIn.current).toEqual(rows);

    fromCalls.length = 0;
    const { result } = renderHook(() => useTeachers(signedOut, { school_id: 'school-1' }));
    await settle();

    expect(fromCalls).toEqual([]);
    expect(result.current).toEqual([]);
  });
});
