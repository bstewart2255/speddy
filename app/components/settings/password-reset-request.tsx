'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/card';
import { Button } from '../ui/button';

interface PasswordResetRequestProps {
  requestedAt: string | null;
  onRequestSubmitted: () => void;
}

export function PasswordResetRequest({ requestedAt, onRequestSubmitted }: PasswordResetRequestProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/provider/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit request');
      }

      setSuccess(true);
      onRequestSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const hasPendingRequest = requestedAt !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700">Password Reset</h3>
            <p className="mt-1 text-sm text-gray-500">
              Request a password reset from your site administrator. They will provide you with a temporary password.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {(success || hasPendingRequest) ? (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <span className="font-medium">Request submitted</span>
                {requestedAt && (
                  <span> on {formatDate(requestedAt)}</span>
                )}
              </p>
              <p className="mt-1 text-sm text-yellow-700">
                Your site administrator will reset your password and provide you with temporary credentials.
              </p>
            </div>
          ) : (
            <Button
              onClick={handleRequest}
              disabled={loading}
              variant="outline"
            >
              {loading ? 'Submitting...' : 'Request Password Reset'}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
