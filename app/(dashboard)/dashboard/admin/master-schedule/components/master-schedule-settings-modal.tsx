'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Cog6ToothIcon, XMarkIcon } from '@heroicons/react/24/outline';
import SchoolHoursForm from '../../../../../components/bell-schedules/school-hours-form';
import { getYardDutyZones, addYardDutyZone, deleteYardDutyZone, type YardDutyZone } from '../../../../../../lib/supabase/queries/yard-duty-zones';

interface MasterScheduleSettingsModalProps {
  schoolId: string;
  onClose: () => void;
  onZonesChanged: () => void;
  onSchoolHoursChanged: () => void;
}

type SettingsTab = 'daily-times' | 'zones';

export function MasterScheduleSettingsModal({
  schoolId,
  onClose,
  onZonesChanged,
  onSchoolHoursChanged,
}: MasterScheduleSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('daily-times');
  const [zoneCount, setZoneCount] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'master-schedule-settings-heading';

  // Fetch zone count for badge
  useEffect(() => {
    getYardDutyZones(schoolId)
      .then((zones) => setZoneCount(zones.length))
      .catch(() => {});
  }, [schoolId]);

  // Focus the modal on mount
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Cog6ToothIcon className="w-5 h-5 text-gray-500" />
            <h2 id={headingId} className="text-lg font-semibold text-gray-900">
              Schedule Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close schedule settings"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'daily-times'}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'daily-times'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('daily-times')}
          >
            Daily Times
          </button>
          <button
            role="tab"
            aria-selected={tab === 'zones'}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'zones'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('zones')}
          >
            Zone Settings
            {zoneCount > 0 && (
              <span className="ml-1.5 text-xs text-gray-400">({zoneCount})</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'daily-times' ? (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Configure school start and end times by grade level. These times are used for daily time markers on the schedule grid.
              </p>
              <SchoolHoursForm
                onSuccess={() => {
                  onSchoolHoursChanged();
                }}
              />
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Manage yard duty zones for your school site. Zones can be assigned when creating yard duty entries.
              </p>
              <InlineZoneSettings
                schoolId={schoolId}
                onZonesChanged={() => {
                  onZonesChanged();
                  getYardDutyZones(schoolId)
                    .then((zones) => setZoneCount(zones.length))
                    .catch(() => {});
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline zone settings (not a separate modal, rendered directly in the settings panel)
 */
function InlineZoneSettings({
  schoolId,
  onZonesChanged,
}: {
  schoolId: string;
  onZonesChanged: () => void;
}) {
  const [zones, setZones] = useState<YardDutyZone[]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchZones = async () => {
    try {
      const data = await getYardDutyZones(schoolId);
      setZones(data);
    } catch (err) {
      console.error('Error fetching zones:', err);
    }
  };

  useEffect(() => {
    fetchZones();
  }, [schoolId]);

  const handleAddZone = async () => {
    const name = newZoneName.trim();
    if (!name) return;

    setLoading(true);
    setError(null);
    try {
      await addYardDutyZone(schoolId, name);
      setNewZoneName('');
      await fetchZones();
      onZonesChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to add zone');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    try {
      await deleteYardDutyZone(zoneId);
      await fetchZones();
      onZonesChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to delete zone');
    }
  };

  // Auto-dismiss error
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Add zone */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newZoneName}
          onChange={(e) => setNewZoneName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddZone();
            }
          }}
          placeholder="New zone name..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={handleAddZone}
          disabled={loading || !newZoneName.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>

      {/* Zone list */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {zones.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">
            No zones configured yet
          </p>
        ) : (
          zones.map((zone) => (
            <div
              key={zone.id}
              className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-gray-50 group"
            >
              <span className="text-sm text-gray-700">{zone.zone_name}</span>
              <button
                onClick={() => handleDeleteZone(zone.id)}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-sm"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
