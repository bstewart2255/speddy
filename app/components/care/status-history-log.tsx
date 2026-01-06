'use client';

import { useState, useEffect } from 'react';
import { getStatusHistory, StatusHistoryEntry } from '@/lib/supabase/queries/care-cases';
import { CARE_DISPOSITIONS } from '@/lib/constants/care';

interface StatusHistoryLogProps {
  caseId: string;
  refreshTrigger?: number;
}

/**
 * Get human-readable label for a status value
 */
function getStatusLabel(status: string): string {
  // Check if it's a disposition value
  const disposition = CARE_DISPOSITIONS.find(d => d.value === status);
  if (disposition) {
    return disposition.label;
  }
  // Return as-is for special statuses like "Moved to Initial"
  return status;
}

/**
 * Format date for display
 * Shows "Jan 6" for current year, "Jan 6, 2025" for other years
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const isCurrentYear = date.getFullYear() === now.getFullYear();

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(isCurrentYear ? {} : { year: 'numeric' }),
  };

  return date.toLocaleDateString('en-US', options);
}

export function StatusHistoryLog({ caseId, refreshTrigger }: StatusHistoryLogProps) {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const data = await getStatusHistory(caseId);
        setHistory(data);
      } catch (err) {
        console.error('Error fetching status history:', err);
        setError('Failed to load status history');
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [caseId, refreshTrigger]);

  if (loading) {
    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Status History</h4>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Status History</h4>
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Status History</h4>
        <p className="text-sm text-gray-500 italic">No status history yet</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-gray-700 mb-2">Status History</h4>
      <ul className="space-y-1">
        {history.map((entry) => {
          const userName = entry.changed_by_user?.full_name || 'Unknown';
          const shortName = userName.split(' ').map((n, i) =>
            i === 0 ? n : n.charAt(0) + '.'
          ).join(' ');

          return (
            <li key={entry.id} className="text-sm text-gray-600 flex items-start">
              <span className="text-gray-400 mr-2">&bull;</span>
              <span>
                <span className="font-medium">{getStatusLabel(entry.status)}</span>
                <span className="text-gray-400"> - </span>
                <span>{formatDate(entry.created_at)}</span>
                <span className="text-gray-400"> by </span>
                <span>{shortName}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
