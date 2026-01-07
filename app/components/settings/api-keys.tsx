'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/card';
import { Button } from '../ui/button';

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  fullKey?: string; // Only present on newly created keys
}

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/api-keys');
      if (!response.ok) {
        throw new Error('Failed to fetch API keys');
      }
      const data = await response.json();
      setKeys(data.keys || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreateKey = async () => {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Chrome Extension' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create API key');
      }

      const data = await response.json();
      setNewKey(data.key);
      fetchKeys(); // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/settings/api-keys?id=${keyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to revoke API key');
      }

      fetchKeys(); // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  const handleCopyKey = async () => {
    if (newKey?.fullKey) {
      await navigator.clipboard.writeText(newKey.fullKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500">
              Generate API keys to connect the Speddy Chrome Extension. Keys are used to securely import data from SEIS.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {/* New Key Modal */}
          {newKey?.fullKey && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-medium text-green-800">New API Key Created</h4>
                  <p className="mt-1 text-xs text-green-700">
                    Copy this key now. It will not be shown again.
                  </p>
                </div>
                <button
                  onClick={() => setNewKey(null)}
                  className="text-green-600 hover:text-green-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 p-2 bg-white border border-green-300 rounded text-sm font-mono text-gray-800 break-all">
                  {newKey.fullKey}
                </code>
                <Button
                  onClick={handleCopyKey}
                  variant="outline"
                  className="shrink-0"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
          )}

          {/* Keys List */}
          {loading ? (
            <div className="text-sm text-gray-500">Loading API keys...</div>
          ) : keys.length === 0 ? (
            <div className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-300 rounded-md">
              No API keys yet. Generate one to use with the Chrome Extension.
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-md"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gray-600">
                        {key.key_prefix}...
                      </code>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-sm text-gray-600">{key.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      Created {formatDate(key.created_at)}
                      {key.last_used_at && (
                        <span> • Last used {formatDate(key.last_used_at)}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleRevokeKey(key.id)}
                    variant="ghost"
                    className="text-red-600 hover:text-red-800 hover:bg-red-50"
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleCreateKey}
            disabled={creating}
          >
            {creating ? 'Generating...' : 'Generate New API Key'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
