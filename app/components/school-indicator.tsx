"use client";

import { useSchool } from './providers/school-context';

export function SchoolIndicator() {
  const { currentSchool, loading } = useSchool();

  if (loading || !currentSchool) {
    return null;
  }

  return (
    <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm text-blue-700">
            Currently viewing: <span className="font-medium">{currentSchool.school_site}</span>
            {currentSchool.school_district && (
              <span className="text-blue-600"> • {currentSchool.school_district}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}