'use client';

import { useEffect, useRef } from 'react';
import { Printer, Edit, Trash2, X } from 'lucide-react';
import type { Database } from '@/src/types/database';
import type { LessonContent } from '@/lib/types/lesson';

type Lesson = Database["public"]["Tables"]["lessons"]["Row"];

interface ManualLessonViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: Lesson;
  onEdit: (lesson: Lesson) => void;
  onDelete: (lessonId: string) => void;
}

export function ManualLessonViewModal({
  isOpen,
  onClose,
  lesson,
  onEdit,
  onDelete
}: ManualLessonViewModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // Add escape key handler and body scroll prevention
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (!printRef.current) return;

    const printContent = printRef.current;
    const printWindow = window.open('', '', 'width=800,height=600');
    
    if (!printWindow) {
      alert('Please allow popups to print the lesson plan');
      return;
    }

    const styles = `
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #1f2937;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 { 
          color: #111827; 
          font-size: 24px;
          margin-bottom: 8px;
        }
        h2 { 
          color: #374151; 
          font-size: 18px;
          margin-top: 24px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e5e7eb;
        }
        .meta-info {
          color: #6b7280;
          font-size: 14px;
          margin-bottom: 24px;
        }
        .section {
          margin-bottom: 20px;
        }
        .content {
          white-space: pre-wrap;
          color: #374151;
        }
        .empty {
          color: #9ca3af;
          font-style: italic;
        }
        @media print {
          body { padding: 0; }
        }
      </style>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>${lesson.title} - Lesson Plan</title>
          ${styles}
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this lesson plan?')) {
      onDelete(lesson.id);
      onClose();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const renderSection = (title: string, content: string | null | undefined, isLarge = false) => {
    return (
      <div className="section">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">{title}</h2>
        <div className={`${isLarge ? 'text-sm' : 'text-sm'} text-gray-600 whitespace-pre-wrap`}>
          {content || <span className="text-gray-400 italic">Not specified</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity duration-300 ease-in-out" 
        onClick={onClose} 
      />

      {/* Center modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full transform transition-all duration-300 ease-out"
          style={{
            animation: isOpen ? 'slideIn 0.3s ease-out' : '',
          }}
        >
          {/* Header with actions */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-medium text-gray-900">Manual Lesson Plan</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Print lesson plan"
              >
                <Printer className="h-5 w-5" />
              </button>
              <button
                onClick={() => onEdit(lesson)}
                className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit lesson plan"
              >
                <Edit className="h-5 w-5" />
              </button>
              <button
                onClick={handleDelete}
                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete lesson plan"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body - Scrollable */}
          <div className="px-6 py-4 max-h-[calc(90vh-8rem)] overflow-y-auto">
            {/* Print content wrapper */}
            <div ref={printRef}>
              {/* Title and metadata */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{lesson.title}</h1>
                <div className="text-sm text-gray-500 space-y-1">
                  <p><strong>Date:</strong> {formatDate(lesson.lesson_date)}</p>
                  {lesson.subject && <p><strong>Subject:</strong> {lesson.subject}</p>}
                  {lesson.grade_levels && lesson.grade_levels.length > 0 && (
                    <p><strong>Grade Levels:</strong> {lesson.grade_levels.join(', ')}</p>
                  )}
                  {lesson.duration_minutes && (
                    <p><strong>Duration:</strong> {lesson.duration_minutes} minutes</p>
                  )}
                </div>
              </div>

              {/* Learning Objectives */}
              {renderSection('Learning Objectives', (lesson.content as LessonContent)?.objectives)}

              {/* Materials Needed */}
              {renderSection('Materials Needed', (lesson.content as LessonContent)?.materials)}

              {/* Activities/Steps */}
              {(lesson.content as LessonContent)?.activities && (
                <div className="section">
                  <h2 className="text-sm font-semibold text-gray-700 mb-2">Activities/Steps</h2>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {typeof (lesson.content as LessonContent).activities === 'string'
                      ? String((lesson.content as LessonContent).activities)
                      : JSON.stringify((lesson.content as LessonContent).activities, null, 2)}
                  </div>
                </div>
              )}

              {/* Assessment Methods */}
              {renderSection('Assessment Methods', (lesson.content as LessonContent)?.assessment)}

              {/* Notes */}
              {lesson.notes && (
                <div className="section mt-6 p-4 bg-gray-50 rounded-lg">
                  <h2 className="text-sm font-semibold text-gray-700 mb-2">Notes</h2>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {lesson.notes}
                  </div>
                </div>
              )}

              {/* Footer info for print */}
              <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 print-only" style={{ display: 'none' }}>
                <p>Created: {new Date(lesson.created_at).toLocaleString()}</p>
                {lesson.updated_at !== lesson.created_at && (
                  <p>Last updated: {new Date(lesson.updated_at).toLocaleString()}</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4">
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style jsx>{`
        @media print {
          .print-only {
            display: block !important;
          }
        }
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