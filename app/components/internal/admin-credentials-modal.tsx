'use client';

import { useState } from 'react';

interface AdminCredentialsModalProps {
  admin: {
    email: string;
    fullName: string;
    temporaryPassword: string;
    adminType: 'district_admin' | 'site_admin';
  };
  onClose: () => void;
}

export function AdminCredentialsModal({ admin, onClose }: AdminCredentialsModalProps) {
  const [emailCopied, setEmailCopied] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(admin.email);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const handleCopyPassword = async () => {
    await navigator.clipboard.writeText(admin.temporaryPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  const handleClose = () => {
    const confirmed = window.confirm(
      'Have you saved these credentials? They will not be shown again after closing this window.'
    );
    if (confirmed) {
      onClose();
    }
  };

  const adminTypeLabel = admin.adminType === 'district_admin' ? 'District Admin' : 'Site Admin';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-w-md w-full p-6 m-4">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-400">
              Account Created Successfully
            </h2>
          </div>
          <p className="text-slate-300">
            {adminTypeLabel} account for <strong className="text-white">{admin.fullName}</strong> has been created.
          </p>
        </div>

        {/* Warning */}
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-md p-4 mb-6">
          <div className="flex">
            <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-yellow-400 font-medium">
                Save these credentials now!
              </p>
              <p className="text-sm text-yellow-500/80 mt-1">
                These login credentials will only be shown once. Copy them and share with the customer securely.
              </p>
            </div>
          </div>
        </div>

        {/* Credentials */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Email (Username)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={admin.email}
                readOnly
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white font-mono text-sm"
              />
              <button
                onClick={handleCopyEmail}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  emailCopied
                    ? 'bg-green-600 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {emailCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Temporary Password
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={admin.temporaryPassword}
                readOnly
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white font-mono text-sm"
              />
              <button
                onClick={handleCopyPassword}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  passwordCopied
                    ? 'bg-green-600 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {passwordCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div className="bg-slate-700/50 border border-slate-600 rounded-md p-4 mb-6">
          <p className="text-sm text-slate-300 font-medium mb-2">
            Next Steps:
          </p>
          <ul className="text-sm text-slate-400 space-y-1 ml-4 list-disc">
            <li>Copy both credentials using the buttons above</li>
            <li>Share them securely with the customer (email, call, etc.)</li>
            <li>They can log in at the Speddy portal</li>
            <li>They can then onboard their own staff</li>
          </ul>
        </div>

        {/* Close button */}
        <div className="flex justify-end">
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
          >
            I've Saved the Credentials
          </button>
        </div>
      </div>
    </div>
  );
}
