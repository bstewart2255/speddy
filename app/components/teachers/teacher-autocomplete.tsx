'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { searchTeachers, formatTeacherName } from '@/lib/supabase/queries/school-directory';

type Teacher = Awaited<ReturnType<typeof searchTeachers>>[number];

interface TeacherAutocompleteProps {
  value: string | null; // teacher_id or null
  teacherName?: string; // Display name if teacher_id is set
  onChange: (teacherId: string | null, teacherName: string | null) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  schoolId?: string; // Optional school_id to search teachers from a specific school
}

export function TeacherAutocomplete({
  value,
  teacherName,
  onChange,
  placeholder = 'Search for a teacher...',
  required = false,
  className = '',
  disabled = false,
  schoolId
}: TeacherAutocompleteProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Handle clicks outside dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search for teachers when search term changes
  useEffect(() => {
    const searchForTeachers = async () => {
      if (searchTerm.length < 2) {
        setTeachers([]);
        setHighlightedIndex(-1);
        return;
      }

      try {
        setLoading(true);
        const results = await searchTeachers(searchTerm, schoolId);
        setTeachers(results);
        setHighlightedIndex(-1);
        setIsOpen(true);
      } catch (error) {
        console.error('Error searching teachers:', error);
        setTeachers([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(searchForTeachers, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, schoolId]);

  const handleSelect = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    onChange(teacher.id, formatTeacherName(teacher));
  };

  const handleClear = () => {
    setSelectedTeacher(null);
    setSearchTerm('');
    setHighlightedIndex(-1);
    onChange(null, null);
  };

  // Keyboard navigation so a teacher can be picked without the mouse (SPE-237).
  // Enter here NEVER submits the parent form — it selects the highlighted (or
  // first) result, so the user can't accidentally save a student with no teacher.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && teachers.length > 0) setIsOpen(true);
      setHighlightedIndex((i) => Math.min(i + 1, teachers.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && teachers.length > 0) {
        handleSelect(teachers[highlightedIndex >= 0 ? highlightedIndex : 0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  // Display value
  const displayValue = selectedTeacher
    ? formatTeacherName(selectedTeacher)
    : teacherName || '';

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Selected Teacher Display */}
      {(selectedTeacher || teacherName) && !isOpen ? (
        <div className="flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white">
          <div className="flex items-center space-x-2">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">{displayValue}</span>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-2 text-gray-400 hover:text-gray-600 focus:outline-none"
              aria-label="Clear selection"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Search Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => searchTerm.length >= 2 && setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              required={required && !value}
              disabled={disabled}
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {loading && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>

          {/* Dropdown Results */}
          {isOpen && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {teachers.length === 0 ? (
                <div className="px-4 py-3">
                  {searchTerm.length < 2 ? (
                    <p className="text-sm text-gray-500">Type at least 2 characters to search...</p>
                  ) : loading ? (
                    <p className="text-sm text-gray-500">Searching...</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500">No teachers found matching "{searchTerm}"</p>
                      <div className="px-3 py-2 bg-blue-50 rounded-md">
                        <p className="text-xs text-blue-700">
                          <span className="font-medium">Teacher not in the system?</span>
                          <br />
                          Contact your site admin to add them.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <ul className="py-1" role="listbox" id={listboxId}>
                  {teachers.map((teacher, index) => (
                    <li key={teacher.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === highlightedIndex}
                        onClick={() => handleSelect(teacher)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`w-full text-left px-4 py-2 focus:outline-none transition-colors ${index === highlightedIndex ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {formatTeacherName(teacher)}
                            </div>
                            {(teacher.email || teacher.classroom_number) && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {teacher.classroom_number && `Room ${teacher.classroom_number}`}
                                {teacher.classroom_number && teacher.email && ' • '}
                                {teacher.email}
                              </div>
                            )}
                          </div>
                          <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
