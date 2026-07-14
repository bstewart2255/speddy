/**
 * Unit tests for the batched confirm-path result mapper (SPE-229).
 * All values fictional.
 */

import {
  mapUpsertResults,
  PendingUpsert,
  UpsertRpcResult,
} from '@/lib/import/upsert-result-mapper';

describe('mapUpsertResults', () => {
  it('maps a successful insert, taking the new id from the RPC result', () => {
    const pending: PendingUpsert[] = [{ initials: 'AA', gradeLevel: '1', action: 'insert' }];
    const rpc: UpsertRpcResult[] = [
      { action: 'inserted', studentId: 'new-id-1', initials: 'AA', success: true },
    ];
    expect(mapUpsertResults(pending, rpc)).toEqual([
      {
        result: { success: true, studentId: 'new-id-1', initials: 'AA', action: 'inserted' },
        outcome: 'inserted',
      },
    ]);
  });

  it('maps a successful update, keeping the existing student id', () => {
    const pending: PendingUpsert[] = [
      { initials: 'BB', gradeLevel: 'TK', action: 'update', studentId: 'existing-2' },
    ];
    const rpc: UpsertRpcResult[] = [
      { action: 'updated', studentId: 'existing-2', initials: 'BB', success: true },
    ];
    expect(mapUpsertResults(pending, rpc)).toEqual([
      {
        result: { success: true, studentId: 'existing-2', initials: 'BB', action: 'updated' },
        outcome: 'updated',
      },
    ]);
  });

  it('rewrites a duplicate-key error to the friendly "already exists" message', () => {
    const pending: PendingUpsert[] = [{ initials: 'CC', gradeLevel: '3', action: 'insert' }];
    const rpc: UpsertRpcResult[] = [
      {
        action: 'insert',
        initials: 'CC',
        success: false,
        error: 'duplicate key value violates unique constraint "ux_students_provider_grade_initials"',
      },
    ];
    const [mapped] = mapUpsertResults(pending, rpc);
    expect(mapped.outcome).toBe('error');
    expect(mapped.result).toEqual({
      success: false,
      studentId: undefined,
      initials: 'CC',
      action: 'error',
      error: 'Student with initials "CC" in grade 3 already exists',
    });
  });

  it('passes a non-duplicate error through verbatim, and keeps the update id on failure', () => {
    const pending: PendingUpsert[] = [
      { initials: 'DD', gradeLevel: '4', action: 'update', studentId: 'existing-4' },
    ];
    const rpc: UpsertRpcResult[] = [
      { action: 'update', initials: 'DD', success: false, error: 'null value in column "x"' },
    ];
    expect(mapUpsertResults(pending, rpc)[0].result).toEqual({
      success: false,
      studentId: 'existing-4',
      initials: 'DD',
      action: 'error',
      error: 'null value in column "x"',
    });
  });

  it('treats a missing RPC element as an error (index misalignment / short array)', () => {
    const pending: PendingUpsert[] = [{ initials: 'EE', gradeLevel: '5', action: 'insert' }];
    const mapped = mapUpsertResults(pending, []);
    expect(mapped[0].outcome).toBe('error');
    expect(mapped[0].result.error).toBe('Unknown error');
  });

  it('maps a mixed batch strictly by index', () => {
    const pending: PendingUpsert[] = [
      { initials: 'AA', gradeLevel: '1', action: 'insert' },
      { initials: 'BB', gradeLevel: '2', action: 'update', studentId: 'existing-b' },
      { initials: 'CC', gradeLevel: '3', action: 'insert' },
    ];
    const rpc: UpsertRpcResult[] = [
      { action: 'inserted', studentId: 'new-a', initials: 'AA', success: true },
      { action: 'updated', studentId: 'existing-b', initials: 'BB', success: true },
      { action: 'insert', initials: 'CC', success: false, error: 'unique constraint' },
    ];
    const mapped = mapUpsertResults(pending, rpc);
    expect(mapped.map((m) => m.outcome)).toEqual(['inserted', 'updated', 'error']);
    expect(mapped[0].result.studentId).toBe('new-a');
    expect(mapped[1].result.studentId).toBe('existing-b');
    expect(mapped[2].result.error).toMatch(/already exists/);
  });
});
