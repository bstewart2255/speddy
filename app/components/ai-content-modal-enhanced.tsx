"use client";

import * as React from "react";
import { X, Printer, Save, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { WorksheetGenerator } from '../../lib/worksheet-generator';
import { getSanitizedHTML } from '../../lib/sanitize-html';
import { formatTimeSlot } from '../../lib/utils/date-time';

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
}

interface LessonContent {
  timeSlot: string;
  content: string;
  students: Student[];
}

interface AIContentModalEnhancedProps {
  isOpen: boolean;
  onClose: () => void;
  lessons: LessonContent[];
  isLoading: boolean;
  schoolSite?: string;
  onSave?: (savedLesson: any) => void;  
  isViewingSaved?: boolean;
  hideControls?: boolean;
  lessonDate: Date;
}

export function AIContentModalEnhanced({ 
  isOpen, 
  onClose, 
  lessons, 
  isLoading,
  schoolSite,
  onSave,
  isViewingSaved = false,
  hideControls = false,
  lessonDate
}: AIContentModalEnhancedProps) {
  const printRef = React.useRef<HTMLDivElement>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [showNotes, setShowNotes] = React.useState(false);
  const [currentLessonIndex, setCurrentLessonIndex] = React.useState(0);
  const [printMode, setPrintMode] = React.useState<'single' | 'all' | null>(null);
  const [showWorksheetPrompt, setShowWorksheetPrompt] = React.useState(false);

  const currentLesson = lessons[currentLessonIndex];
  const sanitizedContent = currentLesson?.content ? getSanitizedHTML(currentLesson.content) : null;

  // Escape HTML special characters
  function escapeHTML(str: string): string {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  const handlePrintSingle = () => {
    setPrintMode('single');
    setShowWorksheetPrompt(true);
  };

  const handlePrintAll = () => {
    setPrintMode('all');
    // No worksheet prompt for bulk printing as per requirements
    printAllLessons();
  };

  const printSingleLesson = (includeWorksheets: boolean) => {
    const printContent = printRef.current;
    if (!printContent || !currentLesson) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const styles = `
      <style>
        @media print {
          body { margin: 20px; font-family: Arial, sans-serif; }
          .lesson-plan { max-width: 800px; margin: 0 auto; }
          h2, h3, h4 { color: #333 !important; }
          .no-print { display: none !important; }
          @page { margin: 1in; }
        }
      </style>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Lesson Plan - ${formatTimeSlot(currentLesson.timeSlot)}</title>
          ${styles}
        </head>
        <body>
          <div class="print-header" style="margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            <h1 style="margin: 0;">Special Education Lesson Plan</h1>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${lessonDate.toLocaleDateString()}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${formatTimeSlot(currentLesson.timeSlot)}</p>
            <p style="margin: 5px 0;"><strong>Students:</strong> ${currentLesson.students.map(s => `${s.initials} (Grade ${s.grade_level})`).join(', ')}</p>
            ${notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${escapeHTML(notes)}</p>` : ''}
          </div>
          ${sanitizedContent ? sanitizedContent.__html : ''}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      
      // If user chose to include worksheets, generate them
      if (includeWorksheets) {
        generateWorksheetsForLesson(currentLesson);
      }
    }, 250);
  };

  const printAllLessons = () => {
    // Print each lesson as a separate document
    lessons.forEach((lesson, index) => {
      setTimeout(() => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const sanitized = getSanitizedHTML(lesson.content);
        const styles = `
          <style>
            @media print {
              body { margin: 20px; font-family: Arial, sans-serif; }
              .lesson-plan { max-width: 800px; margin: 0 auto; }
              h2, h3, h4 { color: #333 !important; }
              @page { margin: 1in; }
            }
          </style>
        `;

        printWindow.document.write(`
          <html>
            <head>
              <title>Lesson Plan ${index + 1} - ${formatTimeSlot(lesson.timeSlot)}</title>
              ${styles}
            </head>
            <body>
              <div class="print-header" style="margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
                <h1 style="margin: 0;">Special Education Lesson Plan</h1>
                <p style="margin: 5px 0;"><strong>Date:</strong> ${lessonDate.toLocaleDateString()}</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${formatTimeSlot(lesson.timeSlot)}</p>
                <p style="margin: 5px 0;"><strong>Students:</strong> ${lesson.students.map(s => `${s.initials} (Grade ${s.grade_level})`).join(', ')}</p>
              </div>
              ${sanitized ? sanitized.__html : ''}
            </body>
          </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      }, index * 500); // Delay between windows to prevent blocking
    });
  };

  const generateWorksheetsForLesson = async (lesson: LessonContent) => {
    // Generate worksheets for each student in the time slot
    for (const student of lesson.students) {
      try {
        const generator = new WorksheetGenerator();
        
        // Generate math worksheet
        const mathPdf = await generator.generateWorksheet({
          studentName: student.initials,
          gradeLevel: student.grade_level as any, // Grade level from DB
          subject: 'math',
          sessionTime: formatTimeSlot(lesson.timeSlot),
          sessionDate: lessonDate
        });
        
        // Open math worksheet in new window for printing
        const mathWindow = window.open('', '_blank');
        if (mathWindow) {
          mathWindow.document.write(`
            <html>
              <head><title>Math Worksheet - ${student.initials}</title></head>
              <body style="margin: 0;">
                <iframe src="${mathPdf}" width="100%" height="100%" style="border: none;"></iframe>
              </body>
            </html>
          `);
          mathWindow.document.close();
          setTimeout(() => {
            mathWindow.print();
          }, 500);
        }
        
        // Generate ELA worksheet
        const elaGenerator = new WorksheetGenerator();
        const elaPdf = await elaGenerator.generateWorksheet({
          studentName: student.initials,
          gradeLevel: student.grade_level as any, // Grade level from DB
          subject: 'ela',
          sessionTime: formatTimeSlot(lesson.timeSlot),
          sessionDate: lessonDate
        });
        
        // Open ELA worksheet in new window for printing
        const elaWindow = window.open('', '_blank');
        if (elaWindow) {
          elaWindow.document.write(`
            <html>
              <head><title>ELA Worksheet - ${student.initials}</title></head>
              <body style="margin: 0;">
                <iframe src="${elaPdf}" width="100%" height="100%" style="border: none;"></iframe>
              </body>
            </html>
          `);
          elaWindow.document.close();
          setTimeout(() => {
            elaWindow.print();
          }, 500);
        }
        
      } catch (error) {
        console.error(`Failed to generate worksheets for ${student.initials}:`, error);
      }
    }
  };

  const navigateLesson = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentLessonIndex > 0) {
      setCurrentLessonIndex(currentLessonIndex - 1);
    } else if (direction === 'next' && currentLessonIndex < lessons.length - 1) {
      setCurrentLessonIndex(currentLessonIndex + 1);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-5xl h-[90vh] flex flex-col">
        {/* Header with navigation */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">
              AI Generated Lessons - {lessonDate.toLocaleDateString()}
            </h2>
            {lessons.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateLesson('prev')}
                  disabled={currentLessonIndex === 0}
                  className="p-1 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous time slot"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm">
                  {currentLessonIndex + 1} / {lessons.length}
                </span>
                <button
                  onClick={() => navigateLesson('next')}
                  disabled={currentLessonIndex === lessons.length - 1}
                  className="p-1 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next time slot"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Time slot tabs */}
        {lessons.length > 1 && (
          <div className="px-6 py-2 border-b bg-gray-50">
            <div className="flex gap-2 overflow-x-auto">
              {lessons.map((lesson, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentLessonIndex(index)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    index === currentLessonIndex
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {formatTimeSlot(lesson.timeSlot)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Current time slot info */}
        {currentLesson && (
          <div className="px-6 py-3 bg-blue-50 border-b">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Time: {formatTimeSlot(currentLesson.timeSlot)}
                </p>
                <p className="text-sm text-gray-600">
                  Students: {currentLesson.students.map(s => `${s.initials} (Grade ${s.grade_level})`).join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : currentLesson ? (
            <div ref={printRef}>
              <div className="prose max-w-none" dangerouslySetInnerHTML={sanitizedContent || { __html: '' }} />
            </div>
          ) : (
            <div className="text-center text-gray-500">No lesson content available</div>
          )}
        </div>

        {/* Controls */}
        {!hideControls && (
          <div className="px-6 py-4 border-t bg-gray-50 rounded-b-lg">
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <button
                  onClick={handlePrintSingle}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print This Lesson
                </button>
                {lessons.length > 1 && (
                  <button
                    onClick={handlePrintAll}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Print All Lessons
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {onSave && !isViewingSaved && (
                  <button
                    onClick={() => {/* Save logic */}}
                    disabled={saving || saved}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saved ? (
                      <>
                        <Check className="w-4 h-4" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save'}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Worksheet Prompt Modal */}
        {showWorksheetPrompt && printMode === 'single' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md">
              <h3 className="text-lg font-semibold mb-4">Print Worksheets?</h3>
              <p className="mb-4">
                Would you like to also print worksheets for the students in this time slot?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowWorksheetPrompt(false);
                    printSingleLesson(false);
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  No, Just Lesson
                </button>
                <button
                  onClick={() => {
                    setShowWorksheetPrompt(false);
                    printSingleLesson(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Yes, Include Worksheets
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}