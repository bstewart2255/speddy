'use client';

import { useState } from 'react';
import { Button } from '../ui/button';

interface TeacherCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: {
    email: string;
    temporaryPassword: string;
  };
  teacherName: string;
}

export function TeacherCredentialsModal({
  isOpen,
  onClose,
  credentials,
  teacherName,
}: TeacherCredentialsModalProps) {
  const [emailCopied, setEmailCopied] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(credentials.email);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const handleCopyPassword = async () => {
    await navigator.clipboard.writeText(credentials.temporaryPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  const handleClose = () => {
    // Confirm before closing since credentials won't be shown again
    const confirmed = window.confirm(
      'Have you saved these credentials? They will not be shown again after closing this window.'
    );
    if (confirmed) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 m-4">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-green-600 mb-2">
            ✓ Account Created Successfully
          </h2>
          <p className="text-gray-600">
            Teacher account for <strong>{teacherName}</strong> has been created.
          </p>
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700 font-medium">
                Important: Save these credentials now!
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                These login credentials will only be shown once. Copy them and share with the teacher securely.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email (Username)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={credentials.email}
                readOnly
                className="flex-1 px-3 py-2 border rounded bg-gray-50 font-mono text-sm"
              />
              <Button
                onClick={handleCopyEmail}
                variant={emailCopied ? 'secondary' : 'primary'}
                type="button"
              >
                {emailCopied ? '✓ Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temporary Password
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={credentials.temporaryPassword}
                readOnly
                className="flex-1 px-3 py-2 border rounded bg-gray-50 font-mono text-sm"
              />
              <Button
                onClick={handleCopyPassword}
                variant={passwordCopied ? 'secondary' : 'primary'}
                type="button"
              >
                {passwordCopied ? '✓ Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Next Steps:</strong>
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1 ml-4 list-disc">
            <li>Copy both credentials using the buttons above</li>
            <li>Share them securely with the teacher (in person, secure message, etc.)</li>
            <li>Teacher can log in at the portal login page</li>
            <li>Recommend the teacher change their password after first login</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleClose} variant="primary">
            I've Saved the Credentials
          </Button>
        </div>
      </div>
    </div>
  );
}
