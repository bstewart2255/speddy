'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import {
  ACCEPT_ATTR,
  IMPORT_TYPE_META,
  MAX_FILE_SIZE_MB,
  detectImportFile,
  fileExtension,
  ACCEPTED_EXTENSIONS,
  type DetectedImportType,
} from '../../../lib/import/detect-import-file';

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (data: unknown) => void;
  currentSchool?: {
    school_id?: string | null;
    school_site?: string | null;
    display_name?: string | null;
  } | null;
}

interface ImportEntry {
  id: string;
  file: File;
  type: DetectedImportType;
  /** Hard error (unsupported type / too large) — blocks this file from import. */
  error?: string;
  /** Soft note (e.g. roster handled elsewhere, or a replaced duplicate). */
  note?: string;
}

// The roster template offered for download, matching the columns the importer
// expects (Initials/Grade/Teacher required; sessions/minutes optional).
const ROSTER_TEMPLATE_CSV = `Initials,Grade,Teacher,Sessions Per Week,Minutes Per Session
JD,3,Smith,2,30
AB,K,Johnson,3,20
CD,5,Davis,1,45
EF,2,Wilson,2,30
GH,4,Garcia,3,30`;

const CONTRIBUTION_LEGEND = [
  { label: 'Goals report', fills: 'students & IEP goals' },
  { label: 'Deliveries', fills: 'schedules' },
  { label: 'Class list', fills: 'teachers' },
  { label: 'Roster', fills: 'student list' },
];

export function StudentImportModal({
  isOpen,
  onClose,
  onUploadComplete,
  currentSchool,
}: StudentImportModalProps) {
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);

  const resetState = () => {
    setEntries([]);
    setIsDragging(false);
    setSubmitError(null);
  };

  const handleClose = () => {
    if (uploading) return;
    resetState();
    onClose();
  };

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, uploading]);

  const buildEntry = async (file: File): Promise<ImportEntry> => {
    const id = String(++idCounter.current);
    const ext = fileExtension(file.name);

    if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number])) {
      return {
        id,
        file,
        type: 'unknown',
        error: `Unsupported file type ".${ext || '?'}". Accepted: .xlsx, .xls, .csv, .txt`,
      };
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      // Error chips don't show a type badge, so skip the header read here.
      return { id, file, type: 'unknown', error: `File is larger than ${MAX_FILE_SIZE_MB}MB.` };
    }

    const type = await detectImportFile(file);
    if (type === 'roster-template') {
      return {
        id,
        file,
        type,
        note: 'Roster templates import from the "Import CSV" button for now.',
      };
    }
    return { id, file, type };
  };

  const addFiles = async (fileList: FileList | File[]) => {
    setSubmitError(null);
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const built = await Promise.all(incoming.map(buildEntry));

    setEntries((prev) => {
      const next = [...prev];
      for (const entry of built) {
        const formKey = IMPORT_TYPE_META[entry.type].formKey;
        // Replace-last: one file per server-backed type. Note the replacement.
        if (formKey && !entry.error) {
          const existingIndex = next.findIndex(
            (e) => !e.error && IMPORT_TYPE_META[e.type].formKey === formKey
          );
          if (existingIndex !== -1) {
            const replaced = next[existingIndex];
            next.splice(existingIndex, 1);
            entry.note = `replaced ${replaced.file.name}`;
          }
        }
        next.push(entry);
      }
      return next;
    });
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      void addFiles(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void addFiles(e.target.files);
    }
    // Allow re-selecting the same file later.
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const blob = new Blob([ROSTER_TEMPLATE_CSV], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Students_Template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const submittable = entries.filter((e) => !e.error && IMPORT_TYPE_META[e.type].formKey);

  const handleSubmit = async () => {
    if (submittable.length === 0) return;
    setSubmitError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      for (const entry of submittable) {
        const formKey = IMPORT_TYPE_META[entry.type].formKey!;
        formData.append(formKey, entry.file);
      }
      if (currentSchool) {
        formData.append('currentSchoolId', currentSchool.school_id || '');
        formData.append('currentSchoolSite', currentSchool.school_site || '');
      }

      const response = await fetch('/api/import-students', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to process files');
      }

      onUploadComplete(result.data);
      resetState();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process files. Please try again.';
      setSubmitError(message);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  const schoolLabel = currentSchool?.display_name || currentSchool?.school_site;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="import-students-title">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={handleClose}
        />

        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-6 border-b">
            <div>
              <h2 id="import-students-title" className="text-xl font-semibold text-gray-900">
                Import Students
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Drop your SEIS and Aeries files — we&apos;ll detect what each one is.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-2xl font-light"
            >
              &times;
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {submitError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {submitError}
              </div>
            )}

            {/* Drop zone — a focusable region (Enter/Space opens the picker).
                A div[role=button] rather than <button> so it can legally hold
                the block content below (a real <button> allows phrasing only). */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Add files: drag and drop here, or press Enter to browse"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`w-full cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mt-3 text-sm font-medium text-gray-900">Drag files here, or click to browse</p>
              <p className="mt-1 text-sm text-gray-600">
                Any one file is enough to start — each extra file just fills in more.
              </p>
              <p className="mt-2 text-xs text-gray-400">.xlsx, .xls, .csv, .txt · up to {MAX_FILE_SIZE_MB}MB each</p>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              onChange={handleInputChange}
              className="hidden"
            />

            {/* Contribution legend */}
            <p className="text-xs text-gray-500">
              {CONTRIBUTION_LEGEND.map((item, i) => (
                <span key={item.label}>
                  {i > 0 && <span className="text-gray-300"> · </span>}
                  <span className="font-medium text-gray-600">{item.label}</span> → {item.fills}
                </span>
              ))}
            </p>

            {/* Detected files */}
            {entries.length > 0 && (
              <ul className="space-y-2">
                {entries.map((entry) => {
                  const meta = IMPORT_TYPE_META[entry.type];
                  const tone = entry.error
                    ? 'border-red-200 bg-red-50'
                    : entry.type === 'roster-template'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-gray-200 bg-white';
                  return (
                    <li
                      key={entry.id}
                      className={`flex items-start justify-between gap-3 rounded-md border p-3 ${tone}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">{entry.file.name}</span>
                          {!entry.error && (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {meta.label}
                            </span>
                          )}
                        </div>
                        {entry.error ? (
                          <p className="mt-0.5 text-xs text-red-600">{entry.error}</p>
                        ) : (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {meta.contribution && <>Fills in {meta.contribution}</>}
                            {entry.note && <span className="text-amber-700"> · {entry.note}</span>}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        aria-label={`Remove ${entry.file.name}`}
                        className="shrink-0 text-sm text-gray-500 hover:text-gray-800"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Roster template download */}
            <p className="text-xs text-gray-500">
              Have your caseload in a spreadsheet?{' '}
              <button type="button" onClick={downloadTemplate} className="font-medium text-blue-600 hover:text-blue-800 underline">
                Download the roster template
              </button>
            </p>

            {schoolLabel && (
              <div className="text-xs text-gray-700 bg-green-50 border border-green-200 rounded-md p-2">
                <strong>Importing to:</strong> {schoolLabel}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <Button variant="secondary" onClick={handleClose} disabled={uploading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={uploading || submittable.length === 0}>
              {uploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </>
              ) : submittable.length === 0 ? (
                'Import'
              ) : (
                `Import ${submittable.length} ${submittable.length === 1 ? 'file' : 'files'}`
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
