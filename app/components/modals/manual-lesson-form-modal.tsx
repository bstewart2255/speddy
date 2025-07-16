'use client';

import { useEffect, useState, useRef } from 'react';

interface ManualLesson {
  id?: string;
  title: string;
  subject?: string;
  gradeLevels?: string;
  duration?: number;
  learningObjectives?: string;
  materialsNeeded?: string;
  activities?: string;
  assessmentMethods?: string;
  notes?: string;
}

interface ManualLessonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lessonData: ManualLesson) => void;
  initialData?: ManualLesson;
  lessonDate: Date;
}

export function ManualLessonFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  lessonDate
}: ManualLessonFormModalProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ title?: string }>({});
  
  const [formData, setFormData] = useState<ManualLesson>({
    title: '',
    subject: '',
    gradeLevels: '',
    duration: undefined,
    learningObjectives: '',
    materialsNeeded: '',
    activities: '',
    assessmentMethods: '',
    notes: ''
  });

  // Initialize form with initialData or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        setFormData({
          title: '',
          subject: '',
          gradeLevels: '',
          duration: undefined,
          learningObjectives: '',
          materialsNeeded: '',
          activities: '',
          assessmentMethods: '',
          notes: ''
        });
      }
      setErrors({});
      
      // Auto-focus title field
      setTimeout(() => {
        titleRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialData]);

  // Add escape key handler and body scroll prevention
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, loading]);

  const handleChange = (field: keyof ManualLesson, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for title field when user types
    if (field === 'title' && value) {
      setErrors(prev => ({ ...prev, title: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const newErrors: { title?: string } = {};
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving lesson:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity duration-300 ease-in-out" 
        onClick={!loading ? onClose : undefined} 
      />

      {/* Center modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full transform transition-all duration-300 ease-out"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          style={{
            animation: isOpen ? 'slideIn 0.3s ease-out' : '',
          }}
        >
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 id="modal-title" className="text-lg font-medium text-gray-900">
              {initialData ? 'Edit' : 'Create'} Manual Lesson Plan
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              For {formatDate(lessonDate)}
            </p>
            <button
              onClick={onClose}
              disabled={loading}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-500 transition-colors disabled:opacity-50"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="px-6 py-4 max-h-[calc(90vh-8rem)] overflow-y-auto">
            <div className="space-y-4">
              {/* Title (Required) */}
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  ref={titleRef}
                  type="text"
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                    errors.title 
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder="Enter lesson title"
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">{errors.title}</p>
                )}
              </div>

              {/* Subject/Topic */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
                  Subject/Topic
                </label>
                <input
                  type="text"
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => handleChange('subject', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., Mathematics, Reading, Science"
                />
              </div>

              {/* Grade Levels */}
              <div>
                <label htmlFor="gradeLevels" className="block text-sm font-medium text-gray-700">
                  Grade Levels
                </label>
                <input
                  type="text"
                  id="gradeLevels"
                  value={formData.gradeLevels}
                  onChange={(e) => handleChange('gradeLevels', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., K-2, 3-5 (comma separated)"
                />
              </div>

              {/* Duration */}
              <div>
                <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  id="duration"
                  value={formData.duration || ''}
                  onChange={(e) => handleChange('duration', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., 30, 45, 60"
                  min="1"
                />
              </div>

              {/* Learning Objectives */}
              <div>
                <label htmlFor="learningObjectives" className="block text-sm font-medium text-gray-700">
                  Learning Objectives
                </label>
                <textarea
                  id="learningObjectives"
                  value={formData.learningObjectives}
                  onChange={(e) => handleChange('learningObjectives', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="What will students learn or be able to do?"
                />
              </div>

              {/* Materials Needed */}
              <div>
                <label htmlFor="materialsNeeded" className="block text-sm font-medium text-gray-700">
                  Materials Needed
                </label>
                <textarea
                  id="materialsNeeded"
                  value={formData.materialsNeeded}
                  onChange={(e) => handleChange('materialsNeeded', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="List materials, resources, or tools needed"
                />
              </div>

              {/* Activities/Steps */}
              <div>
                <label htmlFor="activities" className="block text-sm font-medium text-gray-700">
                  Activities/Steps
                </label>
                <textarea
                  id="activities"
                  value={formData.activities}
                  onChange={(e) => handleChange('activities', e.target.value)}
                  rows={6}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Describe the lesson activities and steps in detail"
                />
              </div>

              {/* Assessment Methods */}
              <div>
                <label htmlFor="assessmentMethods" className="block text-sm font-medium text-gray-700">
                  Assessment Methods
                </label>
                <textarea
                  id="assessmentMethods"
                  value={formData.assessmentMethods}
                  onChange={(e) => handleChange('assessmentMethods', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="How will you assess student learning?"
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Additional notes or reminders"
                />
              </div>
            </div>

            {/* Footer with buttons */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </span>
                ) : (
                  'Save Lesson Plan'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Animation keyframes */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}