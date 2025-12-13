'use client';

import Link from 'next/link';

export default function InternalHomePage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Internal Admin Portal</h1>
        <p className="mt-2 text-slate-400">
          Onboard new school district customers by creating their first admin account.
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Browse Districts */}
        <Link
          href="/internal/districts"
          className="block p-6 bg-slate-800 rounded-lg border border-slate-700 hover:border-purple-500 transition-colors group"
        >
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-purple-600/20 rounded-lg">
              <svg
                className="w-6 h-6 text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
                Browse Districts
              </h2>
              <p className="text-sm text-slate-400">
                View all states, districts, and schools in the NCES database
              </p>
            </div>
          </div>
        </Link>

        {/* Create Admin */}
        <Link
          href="/internal/create-admin"
          className="block p-6 bg-slate-800 rounded-lg border border-slate-700 hover:border-purple-500 transition-colors group"
        >
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-purple-600/20 rounded-lg">
              <svg
                className="w-6 h-6 text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
                Create Admin Account
              </h2>
              <p className="text-sm text-slate-400">
                Create a district or site admin for a new customer
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Info section */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Onboarding Workflow</h3>
        <ol className="space-y-3 text-slate-300">
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-purple-600 text-white text-sm font-medium mr-3">
              1
            </span>
            <span>
              <strong className="text-white">Find the district</strong> - Browse by state and search for the school district
            </span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-purple-600 text-white text-sm font-medium mr-3">
              2
            </span>
            <span>
              <strong className="text-white">Create admin account</strong> - Enter their email and name, select admin type (district or site)
            </span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-purple-600 text-white text-sm font-medium mr-3">
              3
            </span>
            <span>
              <strong className="text-white">Share credentials</strong> - Copy the temporary password and send to the customer
            </span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-purple-600 text-white text-sm font-medium mr-3">
              4
            </span>
            <span>
              <strong className="text-white">Customer self-serves</strong> - They log in and can onboard their own staff
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
