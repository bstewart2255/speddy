'use client';

import { useState } from 'react';
import { Button } from '../ui/button';

export interface SchoolFormData {
  name: string;
  city: string;
  schoolType: string;
  gradeSpanLow: string;
  gradeSpanHigh: string;
  phone: string;
  website: string;
}

interface SchoolFormProps {
  initialData?: Partial<SchoolFormData>;
  onSubmit: (data: SchoolFormData) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  isEditMode?: boolean;
}

const SCHOOL_TYPES = [
  { value: '', label: 'Select...' },
  { value: 'Elementary', label: 'Elementary' },
  { value: 'Middle', label: 'Middle' },
  { value: 'High', label: 'High' },
  { value: 'K-8', label: 'K-8' },
  { value: 'K-12', label: 'K-12' },
  { value: 'Other', label: 'Other' },
];

const GRADE_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'PK', label: 'PK' },
  { value: 'KG', label: 'KG' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: String(i + 1),
  })),
];

export function SchoolForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
  isEditMode = false,
}: SchoolFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [city, setCity] = useState(initialData?.city || '');
  const [schoolType, setSchoolType] = useState(initialData?.schoolType || '');
  const [gradeSpanLow, setGradeSpanLow] = useState(initialData?.gradeSpanLow || '');
  const [gradeSpanHigh, setGradeSpanHigh] = useState(initialData?.gradeSpanHigh || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [website, setWebsite] = useState(initialData?.website || '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('School name is required');
      return;
    }

    try {
      await onSubmit({
        name: name.trim(),
        city: city.trim(),
        schoolType,
        gradeSpanLow,
        gradeSpanHigh,
        phone: phone.trim(),
        website: website.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* School Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          School Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="e.g., Lincoln Elementary School"
        />
      </div>

      {/* City */}
      <div>
        <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
          City
        </label>
        <input
          type="text"
          id="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="e.g., Concord"
        />
      </div>

      {/* School Type and Grade Span */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="schoolType" className="block text-sm font-medium text-gray-700 mb-2">
            School Type
          </label>
          <select
            id="schoolType"
            value={schoolType}
            onChange={(e) => setSchoolType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {SCHOOL_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="gradeSpanLow" className="block text-sm font-medium text-gray-700 mb-2">
            Grade Low
          </label>
          <select
            id="gradeSpanLow"
            value={gradeSpanLow}
            onChange={(e) => setGradeSpanLow(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {GRADE_OPTIONS.map((grade) => (
              <option key={grade.value} value={grade.value}>
                {grade.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="gradeSpanHigh" className="block text-sm font-medium text-gray-700 mb-2">
            Grade High
          </label>
          <select
            id="gradeSpanHigh"
            value={gradeSpanHigh}
            onChange={(e) => setGradeSpanHigh(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {GRADE_OPTIONS.map((grade) => (
              <option key={grade.value} value={grade.value}>
                {grade.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Contact Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
            Phone
          </label>
          <input
            type="tel"
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g., (555) 123-4567"
          />
        </div>

        <div>
          <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-2">
            Website
          </label>
          <input
            type="text"
            id="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g., www.lincolnelementary.edu"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <Button type="button" onClick={onCancel} variant="secondary" disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isLoading || !name.trim()}>
          {isLoading ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create School')}
        </Button>
      </div>
    </form>
  );
}
