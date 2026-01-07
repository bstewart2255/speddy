'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface SignInEntry {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  provider: string;
  ipAddress: string | null;
  timestamp: string;
}

interface SignInLogResponse {
  logs: SignInEntry[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

const ROLE_COLORS: Record<string, string> = {
  district_admin: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
  site_admin: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  teacher: 'bg-green-600/20 text-green-400 border-green-500/30',
  speech: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
  psychologist: 'bg-pink-600/20 text-pink-400 border-pink-500/30',
  resource: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30',
  ot: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  sea: 'bg-red-600/20 text-red-400 border-red-500/30',
  unknown: 'bg-slate-600/20 text-slate-400 border-slate-500/30',
};

const ROLE_LABELS: Record<string, string> = {
  district_admin: 'District Admin',
  site_admin: 'Site Admin',
  teacher: 'Teacher',
  speech: 'SLP',
  psychologist: 'Psychologist',
  resource: 'Resource',
  ot: 'OT',
  sea: 'SEA',
  unknown: 'Unknown',
};

export function SignInLog() {
  const [logs, setLogs] = useState<SignInEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const fetchLogs = useCallback(async (newOffset: number = 0, append: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/internal/sign-in-logs?limit=${limit}&offset=${newOffset}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch sign-in logs');
      }

      const data: SignInLogResponse = await response.json();

      if (append) {
        setLogs(prev => [...prev, ...data.logs]);
      } else {
        setLogs(data.logs);
      }

      setHasMore(data.pagination.hasMore);
      setOffset(newOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchLogs(offset + limit, true);
    }
  };

  const refresh = () => {
    setOffset(0);
    fetchLogs(0, false);
  };

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={refresh}
          className="mt-2 text-sm text-red-300 hover:text-red-200 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-lg font-semibold text-white">Recent Sign-ins</h2>
          <p className="text-sm text-slate-400">All user logins across Speddy portals</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <svg
            className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <div className="divide-y divide-slate-700/50">
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-2 text-slate-400">Loading sign-in logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No sign-in events found
          </div>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="p-4 hover:bg-slate-700/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white truncate">
                      {entry.fullName || entry.email}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded border ${
                        ROLE_COLORS[entry.role] || ROLE_COLORS.unknown
                      }`}
                    >
                      {ROLE_LABELS[entry.role] || entry.role}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 truncate mt-0.5">
                    {entry.email}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm text-slate-300">
                    {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {hasMore && (
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={loadMore}
            disabled={loading}
            className="w-full py-2 text-sm text-purple-400 hover:text-purple-300 hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
