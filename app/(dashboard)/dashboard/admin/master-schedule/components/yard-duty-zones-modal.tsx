'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../../../../components/ui/button';
import { TrashIcon } from '@heroicons/react/24/outline';
import {
  getYardDutyZones,
  addYardDutyZone,
  deleteYardDutyZone,
  type YardDutyZone,
} from '../../../../../../lib/supabase/queries/yard-duty-zones';

interface YardDutyZonesModalProps {
  schoolId: string;
  onClose: () => void;
  onZonesChanged: () => void;
}

export function YardDutyZonesModal({
  schoolId,
  onClose,
  onZonesChanged,
}: YardDutyZonesModalProps) {
  const [zones, setZones] = useState<YardDutyZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [newZoneName, setNewZoneName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchZones();
  }, [schoolId]);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const fetchZones = async () => {
    try {
      setLoading(true);
      const data = await getYardDutyZones(schoolId);
      setZones(data);
    } catch (err) {
      console.error('Error fetching zones:', err);
      setError('Failed to load zones');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const name = newZoneName.trim();
    if (!name) return;

    setError(null);
    setAdding(true);
    try {
      await addYardDutyZone(schoolId, name);
      setNewZoneName('');
      await fetchZones();
      onZonesChanged();
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to add zone');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (zone: YardDutyZone) => {
    setError(null);
    setDeleting(zone.id);
    try {
      await deleteYardDutyZone(zone.id);
      await fetchZones();
      onZonesChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to delete zone');
    } finally {
      setDeleting(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !adding) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="zones-modal-heading"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 id="zones-modal-heading" className="text-lg font-semibold text-gray-900">
            Yard Duty Zones
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Define the zones/locations used for yard duty assignments.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-4">
              {error}
            </div>
          )}

          {/* Add new zone */}
          <div className="flex gap-2 mb-4">
            <input
              ref={inputRef}
              type="text"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Basketball & Blacktop"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={adding}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleAdd}
              disabled={adding || !newZoneName.trim()}
            >
              {adding ? 'Adding...' : 'Add'}
            </Button>
          </div>

          {/* Zone list */}
          {loading ? (
            <div className="py-8 text-center text-gray-500 text-sm">Loading zones...</div>
          ) : zones.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">
              No zones configured yet. Add your first zone above.
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-50 group"
                >
                  <span className="text-sm text-gray-900">{zone.zone_name}</span>
                  <button
                    onClick={() => handleDelete(zone)}
                    disabled={deleting === zone.id}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-gray-400 hover:text-red-600 transition-all"
                    title={`Delete ${zone.zone_name}`}
                  >
                    {deleting === zone.id ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <TrashIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
