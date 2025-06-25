"use client";

import { useSchool } from './providers/school-context';
import { useState, useRef, useEffect } from 'react';

export function SchoolSwitcher() {
  const { currentSchool, availableSchools, setCurrentSchool, loading } = useSchool();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading || !currentSchool || availableSchools.length <= 1) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <div className="text-left">
          <div className="font-semibold">{currentSchool.school_site}</div>
          <div className="text-xs text-gray-500">{currentSchool.school_district}</div>
        </div>
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200">
          <div className="py-1">
            {availableSchools.map((school) => (
              <button
                key={`${school.school_district}-${school.school_site}`}
                onClick={() => {
                  setCurrentSchool(school);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                  currentSchool.school_site === school.school_site && 
                  currentSchool.school_district === school.school_district
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'
                }`}
              >
                <div className="font-medium">{school.school_site}</div>
                <div className="text-xs text-gray-500">{school.school_district}</div>
                {school.is_primary && (
                  <span className="text-xs text-blue-600 font-medium">(Primary)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}