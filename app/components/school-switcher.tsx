"use client";

import { useSchool } from './providers/school-context';
import { useState, useRef, useEffect } from 'react';

// Helper component for individual school option
function SchoolOption({ 
  school, 
  isSelected, 
  onClick 
}: { 
  school: any; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
        isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {school.display_name || school.school_site}
            </span>
            {school.is_primary && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                Primary
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {school.full_address || `${school.school_site}`}
          </div>
        </div>
      </div>
    </button>
  );
}

// Helper to check if two schools are the same
function isSchoolSelected(current: any, school: any): boolean {
  if (current.school_id && school.school_id) {
    return current.school_id === school.school_id;
  }
  return current.school_site === school.school_site && 
         current.school_district === school.school_district;
}

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
        <span className="font-semibold">{currentSchool.school_site}</span>
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
        <div className="absolute right-0 z-50 mt-2 w-72 bg-white rounded-md shadow-lg border border-gray-200">
          <div className="py-1 max-h-64 overflow-y-auto">
            {availableSchools.map((school) => (
              <SchoolOption 
                key={school.school_id || `${school.school_district}-${school.school_site}`}
                school={school}
                isSelected={isSchoolSelected(currentSchool, school)}
                onClick={() => {
                  setCurrentSchool(school);
                  setIsOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}