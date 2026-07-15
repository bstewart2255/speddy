'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReviewRow } from '@/lib/import/review-model';

/**
 * Selection state for the import review screen (SPE-227), keyed by stable
 * `row.id` (not array index). A row is selectable unless it's a "no changes"
 * skip; Select-All and the footer counts operate on selectable rows only
 * (SPE-221 semantics). Editable initials and per-goal selection are kept here
 * so the orchestrator can assemble the confirm payload.
 */
export function useReviewSelection(rows: ReviewRow[]) {
  const selectableIds = useMemo(
    () => rows.filter((r) => r.action !== 'skip').map((r) => r.id),
    [rows]
  );

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set(selectableIds));
  const [editedInitials, setEditedInitials] = useState<Record<string, string>>({});
  const [selectedGoals, setSelectedGoals] = useState<Record<string, Set<number>>>(() => {
    const initial: Record<string, Set<number>> = {};
    for (const row of rows) initial[row.id] = new Set(row.goals.map((_, i) => i));
    return initial;
  });

  const initialsFor = useCallback(
    (row: ReviewRow) => editedInitials[row.id] ?? row.initials,
    [editedInitials]
  );

  const setInitials = useCallback((rowId: string, value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    setEditedInitials((prev) => ({ ...prev, [rowId]: cleaned }));
  }, []);

  const isRowSelected = useCallback((rowId: string) => selectedRowIds.has(rowId), [selectedRowIds]);

  const toggleRow = useCallback((rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedRowIds.has(id));

  const toggleSelectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const allSelected = selectableIds.length > 0 && selectableIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(selectableIds);
    });
  }, [selectableIds]);

  const goalsSelectedFor = useCallback(
    (rowId: string): Set<number> => selectedGoals[rowId] ?? new Set<number>(),
    [selectedGoals]
  );

  const toggleGoal = useCallback((rowId: string, goalIndex: number) => {
    setSelectedGoals((prev) => {
      const current = new Set(prev[rowId] ?? []);
      if (current.has(goalIndex)) current.delete(goalIndex);
      else current.add(goalIndex);
      return { ...prev, [rowId]: current };
    });
  }, []);

  const toggleAllGoals = useCallback(
    (row: ReviewRow) => {
      setSelectedGoals((prev) => {
        const current = prev[row.id] ?? new Set<number>();
        const allSelected = current.size === row.goals.length;
        return {
          ...prev,
          [row.id]: allSelected ? new Set() : new Set(row.goals.map((_, i) => i)),
        };
      });
    },
    []
  );

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedRowIds.has(r.id)),
    [rows, selectedRowIds]
  );

  const selectedCount = selectedRows.length;

  const totalSelectedGoals = useMemo(
    () => selectedRows.reduce((sum, r) => sum + (selectedGoals[r.id]?.size ?? 0), 0),
    [selectedRows, selectedGoals]
  );

  return {
    selectableIds,
    isRowSelected,
    toggleRow,
    allSelectableSelected,
    toggleSelectAll,
    initialsFor,
    setInitials,
    goalsSelectedFor,
    toggleGoal,
    toggleAllGoals,
    selectedRows,
    selectedCount,
    totalSelectedGoals,
  };
}

export type ReviewSelection = ReturnType<typeof useReviewSelection>;
