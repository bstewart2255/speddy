'use client';

import { useRef, useState } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { Spinner } from '../ui/spinner';
import {
  ACCEPT_ATTR,
  IMPORT_TYPE_META,
  MAX_FILE_SIZE_MB,
  detectImportFile,
  fileExtension,
  ACCEPTED_EXTENSIONS,
  type DetectedImportType,
} from '../../../lib/import/detect-import-file';
import type { BulkPreviewData } from '../../../lib/types/student-import';

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (data: BulkPreviewData) => void;
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

// Where each SEIS/Aeries export lives and what it fills in Speddy. Drives the
// collapsible "Where to find each file" guide so a first-time user can locate
// and recognize each file without leaving the modal. The click-paths are the
// real in-product navigation for each source system.
interface GuideFile {
  name: string;
  /** What this file populates in Speddy. */
  fills: string;
  /** Click-path steps within the source system; the last step is emphasized. */
  path: string[];
  /** Extra locator shown after the path (e.g. where a button sits, the format). */
  pathAside?: string;
  /** Caveat shown under the path. */
  note?: string;
  /** Marks the file that creates students — the one to upload first. */
  startHere?: boolean;
}

const FILE_GUIDE: Array<{ source: string; files: GuideFile[] }> = [
  {
    source: 'SEIS',
    files: [
      {
        name: 'Student Goals report',
        fills: 'Your students + their IEP goals',
        path: ['Goals', 'Student Goals Report', 'Generate Report', 'Download'],
        startHere: true,
      },
      {
        name: 'Deliveries',
        fills: 'Session schedules (how often & how long)',
        path: ['Service Tracker', 'Deliveries', '“Excel” button'],
        pathAside: 'top-right of Search Results',
        note: 'Downloads as a .csv even though the button says “Excel” — that’s fine.',
      },
      {
        name: 'IEP Dates',
        fills: 'Annual review & triennial dates',
        path: ['Students', 'IEP Dates', 'Download Data', 'All Records', 'Go'],
      },
    ],
  },
  {
    source: 'Aeries',
    files: [
      {
        name: 'Class list',
        fills: 'Teacher assignments',
        path: ['View All Reports', 'Special Ed Class List', 'Print by Teacher'],
        pathAside: '.txt',
      },
    ],
  },
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
  // The "where to find each file" guide defaults open so a first-time user sees
  // it; a repeat user can collapse it and it stays collapsed for the session.
  const [guideOpen, setGuideOpen] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);
  // Bumped on every reset so results from a detection started before the reset
  // (e.g. the user closed the modal mid-read) are discarded instead of
  // repopulating a now-closed modal that stays mounted on the page.
  const detectionGeneration = useRef(0);

  const resetState = () => {
    detectionGeneration.current += 1;
    setEntries([]);
    setIsDragging(false);
    setSubmitError(null);
  };

  const handleClose = () => {
    if (uploading) return;
    resetState();
    onClose();
  };

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

    let type: DetectedImportType;
    try {
      type = await detectImportFile(file);
    } catch {
      // A file that can't be read shouldn't take down the whole batch — surface
      // it as an actionable per-file error.
      return {
        id,
        file,
        type: 'unknown',
        error: 'Could not read this file. Please try selecting it again.',
      };
    }
    return { id, file, type };
  };

  const addFiles = async (fileList: FileList | File[]) => {
    const generation = detectionGeneration.current;
    setSubmitError(null);
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const built = await Promise.all(incoming.map(buildEntry));
    // The modal was reset (e.g. closed) while these files were being detected —
    // drop the stale results rather than repopulating a closed modal.
    if (generation !== detectionGeneration.current) return;

    setEntries((prev) => {
      const next = [...prev];
      for (const entry of built) {
        const formKey = IMPORT_TYPE_META[entry.type].formKey;
        // Replace-last: one file per server-backed type. Header detection is
        // async, so two same-type files picked in separate actions can resolve
        // out of order. `id` is assigned synchronously at pick time, so compare
        // ids to keep whichever was PICKED last (not whichever detection
        // finished last) and never let an older pick splice out a newer one.
        if (formKey && !entry.error) {
          const existingIndex = next.findIndex(
            (e) => !e.error && IMPORT_TYPE_META[e.type].formKey === formKey
          );
          if (existingIndex !== -1) {
            const existing = next[existingIndex];
            if (Number(entry.id) > Number(existing.id)) {
              next.splice(existingIndex, 1);
              entry.note = `replaced ${existing.file.name}`;
              next.push(entry);
            }
            // else: this file was picked earlier but its detection landed late —
            // the newer file already shown wins; drop this stale one.
            continue;
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

      onUploadComplete(result.data as BulkPreviewData);
      resetState();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to process files. Please try again.';
      setSubmitError(message);
    } finally {
      setUploading(false);
    }
  };

  const schoolLabel = currentSchool?.display_name || currentSchool?.school_site;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Students"
      description="Upload your reports from SEIS and Aeries — drop them in together and Speddy figures out what each one is."
      size="2xl"
      dismissable={!uploading}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={uploading || submittable.length === 0}
          >
            {uploading ? (
              <>
                <Spinner className="-ml-1 mr-2 h-4 w-4" />
                Processing...
              </>
            ) : submittable.length === 0 ? (
              'Import'
            ) : (
              `Import ${submittable.length} ${submittable.length === 1 ? 'file' : 'files'}`
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-gray-900">
            Drag files here, or click to browse
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Any one file is enough to start — each extra file just fills in more.
          </p>
          <p className="mt-2 text-xs text-gray-400">
            .xlsx, .xls, .csv, .txt · up to {MAX_FILE_SIZE_MB}MB each
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          onChange={handleInputChange}
          className="hidden"
        />

        {/* How the import works — the one rule that trips up new users. */}
        <div className="flex gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
          <p>
            <span className="font-semibold text-gray-900">Start with the Student Goals report</span> — it&rsquo;s
            the only one of these that creates your students. The other three just add details (schedules, dates,
            teachers) to students Speddy already has, so on their own they have nothing to attach to. Uploading
            everything at once works perfectly: Goals creates each student, the rest fill in the details.
          </p>
        </div>

        {/* Collapsible guide: where to find each file and what it fills. */}
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => setGuideOpen((v) => !v)}
            aria-expanded={guideOpen}
            className="flex w-full items-center justify-between gap-2 bg-gray-50 px-3.5 py-2.5 text-left text-sm font-semibold text-gray-800 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          >
            <span>Where to find each file &amp; what it fills</span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${guideOpen ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>

          {guideOpen && (
            <div className="divide-y divide-gray-100 border-t border-gray-200 px-3.5">
              {FILE_GUIDE.map((group) => (
                <div key={group.source} className="py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {group.source} · {group.files.length} {group.files.length === 1 ? 'file' : 'files'}
                  </p>
                  <ul className="divide-y divide-dashed divide-gray-200">
                    {group.files.map((file) => (
                      <li key={file.name} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-sm font-semibold text-gray-900">{file.name}</span>
                          {file.startHere && (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                              Start here
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm font-medium text-blue-700">{file.fills}</p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                          {file.path.map((step, i) => (
                            <span key={`${i}-${step}`}>
                              {i > 0 && <span className="px-1 text-gray-300"> → </span>}
                              <span className={i === file.path.length - 1 ? 'font-semibold text-gray-700' : undefined}>
                                {step}
                              </span>
                            </span>
                          ))}
                          {file.pathAside && <span className="text-gray-500"> ({file.pathAside})</span>}
                        </p>
                        {file.note && <p className="mt-1 text-xs italic text-gray-500">{file.note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detected files */}
        {entries.length > 0 && (
          <ul className="space-y-2">
            {entries.map((entry) => {
              const meta = IMPORT_TYPE_META[entry.type];
              const tone = entry.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white';
              return (
                <li
                  key={entry.id}
                  className={`flex items-start justify-between gap-3 rounded-md border p-3 ${tone}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {entry.file.name}
                      </span>
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
          No SEIS or Aeries export handy?{' '}
          <button
            type="button"
            onClick={downloadTemplate}
            className="font-medium text-blue-600 hover:text-blue-800 underline"
          >
            Download the roster template
          </button>
          , fill it in, and upload that instead — it creates students too.
        </p>

        {schoolLabel && (
          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md p-2">
            <strong>Importing to:</strong> {schoolLabel}
          </div>
        )}
      </div>
    </Modal>
  );
}
