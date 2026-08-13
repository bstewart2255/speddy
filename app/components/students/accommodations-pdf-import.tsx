'use client';

import { useRef, useState } from 'react';
import { Button } from '../ui/button';

// Mirrors the server limit (which in turn respects the platform's ~4.5MB
// request-body cap) so oversized files fail fast with an honest message.
const MAX_PDF_BYTES = 4 * 1024 * 1024;

/** Match server-side sanitization so duplicate detection agrees with what is stored. */
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

interface Proposal {
  text: string;
  checked: boolean;
}

interface AccommodationsPdfImportProps {
  studentId: string;
  /** Current accommodations in the form, used to flag already-listed proposals. */
  existingAccommodations: string[];
  /** Called with the provider-approved proposals to append to the form. */
  onAdd: (accommodations: string[]) => void;
}

/**
 * Import accommodations from an IEP PDF (SPE-489). Uploads the PDF for one-time
 * AI extraction (the file itself is never stored), then shows the proposed
 * accommodations as a checklist the provider reviews before anything is added
 * to the form — and nothing reaches the database until the form is saved.
 */
export function AccommodationsPdfImport({
  studentId,
  existingAccommodations,
  onAdd,
}: AccommodationsPdfImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  const reset = () => {
    setError(null);
    setNotice(null);
    setProposals(null);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file after an error or cancel.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    reset();

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Unsupported file type. Upload the IEP as a PDF.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(
        'PDF is too large. The limit is 4MB — try the shorter "IEP at a Glance" instead of the full IEP.'
      );
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `/api/students/${studentId}/extract-accommodations`,
        { method: 'POST', body: formData }
      );
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setError(result?.error || 'Failed to read the PDF. Please try again.');
        return;
      }

      const found: string[] = Array.isArray(result?.accommodations)
        ? result.accommodations.filter((a: unknown): a is string => typeof a === 'string')
        : [];

      if (found.length === 0) {
        setNotice(
          'No accommodations were found in this PDF. If the document has them, add them manually — or try the shorter "IEP at a Glance" if you uploaded a full IEP.'
        );
        return;
      }

      // Pre-check everything except items already in the form. The "already
      // listed" badge itself is computed at render time (not stored) so it
      // stays correct if the user edits the form while reviewing.
      const existing = new Set(existingAccommodations.map(normalize));
      setProposals(
        found.map((text) => ({ text, checked: !existing.has(normalize(text)) }))
      );
    } catch {
      setError('Failed to read the PDF. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleProposal = (index: number) => {
    setProposals((prev) =>
      prev ? prev.map((p, i) => (i === index ? { ...p, checked: !p.checked } : p)) : prev
    );
  };

  const selectedCount = proposals?.filter((p) => p.checked).length ?? 0;

  const handleAddSelected = () => {
    if (!proposals) return;
    onAdd(proposals.filter((p) => p.checked).map((p) => p.text));
    reset();
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload IEP PDF"
      />

      {!proposals && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-600">
            Have the IEP as a PDF? Import the accommodations instead of typing them.
            The file is only read once — it isn&apos;t saved.
          </p>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            {loading ? 'Reading PDF…' : 'Import from IEP PDF'}
          </Button>
        </div>
      )}

      {loading && (
        <p className="text-xs text-gray-500" role="status">
          Reading the IEP — this can take up to a minute for long documents.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2" role="status">
          {notice}
        </p>
      )}

      {proposals && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
          <div>
            <h4 className="text-sm font-medium text-gray-900">
              Found {proposals.length} accommodation{proposals.length === 1 ? '' : 's'} in the PDF
            </h4>
            <p className="text-xs text-gray-600 mt-0.5">
              Review the list — uncheck anything that shouldn&apos;t be added. Nothing is
              saved until you save the student&apos;s details.
            </p>
          </div>

          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {(() => {
              // Recomputed each render so the badge tracks live form edits.
              const existing = new Set(existingAccommodations.map(normalize));
              return proposals.map((proposal, index) => (
                <li key={index}>
                  <label className="flex items-start gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={proposal.checked}
                      onChange={() => toggleProposal(index)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex-1">
                      {proposal.text}
                      {existing.has(normalize(proposal.text)) && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                          already listed
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ));
            })()}
          </ul>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" type="button" onClick={reset}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              onClick={handleAddSelected}
              disabled={selectedCount === 0}
            >
              Add {selectedCount} selected
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
