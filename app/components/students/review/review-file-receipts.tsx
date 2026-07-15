'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReviewFileReceipt } from '@/lib/import/review-model';
import { ReviewSignalIcon } from './review-signal';

/**
 * Zone 2 (SPE-227): the per-file receipt. One line per uploaded file — what was
 * read, matched, and filtered — so a problem can be located at the file level
 * (parse vs. match). Parse notes (skipped rows) demote to a tertiary disclosure.
 */
export function ReviewFileReceipts({ files }: { files: ReviewFileReceipt[] }) {
  if (files.length === 0) return null;
  return (
    <section aria-label="Files read">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Files read</h3>
      <ul className="mt-2 space-y-1.5">
        {files.map((file) => (
          <FileReceiptRow key={`${file.fileKey}:${file.fileName}`} file={file} />
        ))}
      </ul>
    </section>
  );
}

function FileReceiptRow({ file }: { file: ReviewFileReceipt }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const allMatched = file.filtered === 0 && file.matched === file.read;

  return (
    <li className="text-sm text-gray-700">
      <div className="flex items-start gap-2">
        <ReviewSignalIcon signal={allMatched ? 'confident' : 'check'} className="mt-0.5" decorative />
        <div className="min-w-0">
          <span className="font-medium text-gray-900">{file.label}</span>
          <span className="text-gray-400"> → </span>
          <span>{file.fills}</span>
          <span className="text-gray-300"> · </span>
          <span className="tabular-nums">
            {file.matched} of {file.read} matched
          </span>
          {file.filtered > 0 && (
            <span className="text-amber-700 tabular-nums"> · {file.filtered} not matched</span>
          )}
          <span className="ml-2 truncate text-xs text-gray-400">({file.fileName})</span>
          {file.notes.length > 0 && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                aria-expanded={notesOpen}
                className="inline-flex items-center gap-0.5 text-xs text-gray-500 underline hover:text-gray-700"
              >
                {notesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {file.notes.length} skipped row{file.notes.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {notesOpen && file.notes.length > 0 && (
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-gray-500">
              {file.notes.map((note, i) => (
                <li key={i}>
                  Row {note.row}: {note.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
