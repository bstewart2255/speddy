'use client';

import React from 'react';
import { Label, FormGroup } from '../ui/form';

export const READING_LEVELS = [
  { value: '', label: 'Select reading level' },
  { value: 'Beginner', label: 'Beginner' },
  { value: 'Intermediate', label: 'Intermediate' },
  { value: 'Advanced', label: 'Advanced' },
] as const;

interface ReadingLevelDropdownProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helperText?: string;
  required?: boolean;
}

export function ReadingLevelDropdown({ 
  value, 
  onChange, 
  label = "Reading Level",
  helperText = "Select the student's reading level for AI lesson content tailoring",
  required = false
}: ReadingLevelDropdownProps) {
  return (
    <FormGroup>
      <Label htmlFor="reading_level" required={required}>
        {label}
      </Label>
      <select
        id="reading_level"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        required={required}
      >
        {READING_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </select>
      {helperText && (
        <p className="text-sm text-gray-600 mt-1">
          {helperText}
        </p>
      )}
    </FormGroup>
  );
}