'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { useToast } from '@/app/contexts/toast-context';
import {
  CURRICULUM_CATALOG,
  isKnownCurriculumId,
  type CurriculumCatalogEntry,
} from '@/lib/curriculums/catalog';

/**
 * District Curriculums (SPE-422) — district admins curate which curriculums
 * their district uses. Providers see exactly this list in the session/group
 * curriculum pickers; until it's configured, their pickers stay empty.
 */
export default function DistrictCurriculumsPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedSelection, setSavedSelection] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/admin/district/curriculums');
        if (response.status === 403) {
          setError('This page is only accessible to district administrators.');
          return;
        }
        if (!response.ok) {
          throw new Error('Failed to load curriculums');
        }
        const data = await response.json();
        // Drop ids the catalog no longer knows: they'd render no checkbox yet
        // be resubmitted on save, which the API rejects — bricking the page
        // until the row was hand-purged. Filtered here, the next save simply
        // prunes them.
        const ids = new Set<string>(
          (data.curriculumIds ?? []).filter((id: string) => isKnownCurriculumId(id))
        );
        setSelected(ids);
        setSavedSelection(new Set(ids));
      } catch (err) {
        console.error('Error loading district curriculums:', err);
        setError('Failed to load curriculums. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasChanges = useMemo(() => {
    if (selected.size !== savedSelection.size) return true;
    for (const id of selected) {
      if (!savedSelection.has(id)) return true;
    }
    return false;
  }, [selected, savedSelection]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/district/curriculums', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curriculumIds: [...selected] }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save curriculums');
      }
      setSavedSelection(new Set(selected));
      showToast('District curriculums saved', 'success');
    } catch (err) {
      console.error('Error saving district curriculums:', err);
      showToast('Failed to save curriculums. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }, [selected, showToast]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, CurriculumCatalogEntry[]>();
    for (const entry of CURRICULUM_CATALOG) {
      const list = groups.get(entry.category) ?? [];
      list.push(entry);
      groups.set(entry.category, list);
    }
    return [...groups.entries()];
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading curriculums...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="p-6">
          <p className="text-red-600">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">District Curriculums</h1>
          <p className="mt-2 text-gray-600">
            Select the curriculums your district uses. Providers will see exactly this
            list when they pick a curriculum, level, and lesson inside their individual
            and group sessions — until you save a selection here, their curriculum
            picker stays empty.
          </p>
        </div>

        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {byCategory.map(([category, entries]) => (
              <div key={category} className="space-y-3">
                <h4 className="font-medium text-gray-900 text-sm uppercase tracking-wider">
                  {category}
                </h4>
                <div className="space-y-1">
                  {entries.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(entry.id)}
                        onChange={() => toggle(entry.id)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-gray-700">{entry.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 mt-6 border-t">
            <p className="text-sm text-gray-500">
              {selected.size} curriculum{selected.size === 1 ? '' : 's'} enabled
            </p>
            <Button onClick={save} disabled={saving || !hasChanges}>
              {saving ? 'Saving...' : 'Save Curriculums'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
