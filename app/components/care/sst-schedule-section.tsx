'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';

interface SstScheduleSectionProps {
  initialDate: string | null;
  initialLink: string | null;
  onUpdate: (data: { sst_scheduled_date: string | null; sst_notes_link: string | null }) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

function isValidUrl(string: string): boolean {
  if (!string) return true; // Empty is valid (optional field)
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SstScheduleSection({
  initialDate,
  initialLink,
  onUpdate,
  onRemove,
  disabled = false,
}: SstScheduleSectionProps) {
  const [scheduledDate, setScheduledDate] = useState(initialDate || '');
  const [notesLink, setNotesLink] = useState(initialLink || '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');

  // Sync with props when they change
  useEffect(() => {
    setScheduledDate(initialDate || '');
    setNotesLink(initialLink || '');
  }, [initialDate, initialLink]);

  // Check if there are unsaved changes
  const hasChanges = scheduledDate !== (initialDate || '') || notesLink !== (initialLink || '');

  // Validate URL on change
  const handleLinkChange = (value: string) => {
    setNotesLink(value);
    if (value && !isValidUrl(value)) {
      setLinkError('Please enter a valid URL (e.g., https://...)');
    } else {
      setLinkError('');
    }
  };

  const handleSave = async () => {
    if (notesLink && !isValidUrl(notesLink)) {
      setLinkError('Please enter a valid URL (e.g., https://...)');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onUpdate({
        sst_scheduled_date: scheduledDate || null,
        sst_notes_link: notesLink || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    // Show confirmation if there's any data entered
    const hasData = scheduledDate || notesLink || initialDate || initialLink;
    if (hasData) {
      const confirmed = confirm(
        'Are you sure you want to remove the SST schedule? This will clear the scheduled date and notes link.'
      );
      if (!confirmed) return;
    }

    setRemoving(true);
    setError('');

    try {
      await onRemove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
      setRemoving(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      {/* Header with title and remove button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">SST Schedule</h3>
        {!disabled && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
            title="Remove SST Schedule"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Form fields - side by side layout */}
      <div className="flex flex-wrap gap-4 items-start">
        {/* Scheduled Date */}
        <div className="flex-shrink-0">
          <label htmlFor="sst-date" className="block text-sm font-medium text-gray-700 mb-1">
            Scheduled Date
          </label>
          <input
            type="date"
            id="sst-date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            disabled={disabled || saving}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* SST Notes Link */}
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="sst-link" className="block text-sm font-medium text-gray-700 mb-1">
            SST Notes Link
          </label>
          {/* Show clickable link if saved, otherwise show input */}
          {initialLink && !hasChanges ? (
            <div className="flex items-center gap-2 py-2">
              <a
                href={initialLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
              >
                <ExternalLink className="h-4 w-4 flex-shrink-0" />
                <span className="truncate max-w-xs">{initialLink}</span>
              </a>
              {!disabled && (
                <button
                  onClick={() => handleLinkChange('')}
                  className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
                >
                  Edit
                </button>
              )}
            </div>
          ) : (
            <>
              <input
                type="url"
                id="sst-link"
                value={notesLink}
                onChange={(e) => handleLinkChange(e.target.value)}
                placeholder="https://docs.google.com/..."
                disabled={disabled || saving}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${
                  linkError ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {linkError && <p className="mt-1 text-xs text-red-600">{linkError}</p>}
            </>
          )}
        </div>
      </div>

      {/* Save button - only show if there are changes */}
      {!disabled && hasChanges && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !!linkError}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
