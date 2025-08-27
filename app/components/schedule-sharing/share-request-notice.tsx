"use client";

import { useState, useEffect, useCallback } from 'react';
import { Users, Download, X } from 'lucide-react';
import type { ImportMode } from '@/lib/schedule-sharing/import-service';

interface ShareRequest {
  id: string;
  sharer_id: string;
  school_id: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    role: string;
  } | null;
}

interface ShareRequestNoticeProps {
  schoolId: string;
  schoolName: string;
}

export function ShareRequestNotice({ schoolId, schoolName }: ShareRequestNoticeProps) {
  const [shareRequests, setShareRequests] = useState<ShareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingRequest, setImportingRequest] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    fetchShareRequests();
  }, [schoolId, fetchShareRequests]);

  const fetchShareRequests = useCallback(async () => {
    try {
      const response = await fetch(`/api/schedule-sharing/requests?school_id=${schoolId}`);
      if (response.ok) {
        const { data } = await response.json();
        setShareRequests(data || []);
      }
    } catch (error) {
      console.error('Error fetching share requests:', error);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  const handleImport = async (request: ShareRequest, mode: ImportMode) => {
    setImportingRequest(request.sharer_id);
    setImportStatus({ [request.sharer_id]: 'Importing...' });

    try {
      const response = await fetch('/api/schedule-sharing/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sharer_id: request.sharer_id,
          school_id: schoolId,
          mode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to import schedules');
      }

      const { result } = await response.json();
      
      // Create success message based on results
      const parts: string[] = [];
      if (result.bell_schedules_imported > 0) {
        parts.push(`${result.bell_schedules_imported} bell schedule${result.bell_schedules_imported !== 1 ? 's' : ''}`);
      }
      if (result.special_activities_imported > 0) {
        parts.push(`${result.special_activities_imported} special ${result.special_activities_imported !== 1 ? 'activities' : 'activity'}`);
      }
      
      let message = 'Import complete: ';
      if (parts.length > 0) {
        message += `Imported ${parts.join(' and ')}`;
      } else {
        message += 'No new items to import';
      }
      
      if (result.duplicates_skipped > 0) {
        message += ` (${result.duplicates_skipped} duplicate${result.duplicates_skipped !== 1 ? 's' : ''} skipped)`;
      }
      if (result.items_replaced > 0) {
        message += ` (${result.items_replaced} item${result.items_replaced !== 1 ? 's' : ''} replaced)`;
      }

      setImportStatus({ [request.sharer_id]: message });
      
      // Remove the request from the list after successful import
      setTimeout(() => {
        setShareRequests(prev => prev.filter(r => r.sharer_id !== request.sharer_id));
        setImportStatus({});
      }, 3000);
    } catch (error) {
      console.error('Error importing schedules:', error);
      setImportStatus({ [request.sharer_id]: 'Import failed. Please try again.' });
    } finally {
      setImportingRequest(null);
    }
  };

  const handleDismiss = async (request: ShareRequest) => {
    try {
      const response = await fetch('/api/schedule-sharing/dismiss', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sharer_id: request.sharer_id,
          school_id: schoolId,
        }),
      });

      if (response.ok) {
        setShareRequests(prev => prev.filter(r => r.sharer_id !== request.sharer_id));
      }
    } catch (error) {
      console.error('Error dismissing share request:', error);
    }
  };

  if (loading || shareRequests.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {shareRequests.map((request) => (
        <div
          key={request.id}
          className="p-4 bg-blue-50 border border-blue-200 rounded-lg"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <Users className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {request.profiles?.full_name || 'A team member'} wants to share their Bell Schedule and Special Activities entries with you.
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Do you want to import them?
                </p>

                {importStatus[request.sharer_id] ? (
                  <div className="mt-3 text-sm text-blue-700">
                    {importStatus[request.sharer_id]}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleImport(request, 'skip_duplicates')}
                        disabled={importingRequest !== null}
                        className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download className="inline h-3 w-3 mr-1" />
                        Skip duplicates (Recommended)
                      </button>
                      <button
                        onClick={() => handleImport(request, 'replace_existing')}
                        disabled={importingRequest !== null}
                        className="px-3 py-1.5 text-sm font-medium bg-white text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        Replace existing
                      </button>
                      <button
                        onClick={() => handleImport(request, 'import_all')}
                        disabled={importingRequest !== null}
                        className="px-3 py-1.5 text-sm font-medium bg-white text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        Import all
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      <strong>Skip duplicates:</strong> Import only new items |
                      <strong> Replace existing:</strong> Overwrite your items |
                      <strong> Import all:</strong> Add everything, even duplicates
                    </p>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDismiss(request)}
              disabled={importingRequest === request.sharer_id}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}