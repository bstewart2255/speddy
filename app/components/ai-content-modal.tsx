"use client";

import React from "react";
import { X, Printer, Save, Check } from "lucide-react";
import { WorksheetGenerator } from '../../lib/worksheet-generator';
import { getSanitizedHTML } from '@/lib/sanitize-html';

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
}

interface AIContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeSlot: string;
  students: Student[];
  content: string | null;
  isLoading: boolean;
  schoolSite?: string;
  onSave?: (savedLesson: any) => void;  
  isViewingSaved?: boolean;
  hideControls?: boolean;
}

export function AIContentModal({ 
  isOpen, 
  onClose, 
  timeSlot, 
  students, 
  content, 
  isLoading,
  schoolSite,
  onSave,
  isViewingSaved = false,
  hideControls = false
}: AIContentModalProps) {
  const printRef = React.useRef<HTMLDivElement>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [showNotes, setShowNotes] = React.useState(false);
  const sanitizedContent = content ? getSanitizedHTML(content) : null;

  // Reset saved state when modal opens with new content
  React.useEffect(() => {
    if (isOpen && content) {
      setSaved(false);
      setNotes("");
      setShowNotes(false);
    }
  }, [isOpen, content]);

  const handleSave = async () => {
    if (!content || saving) return;

    setSaving(true);
    try {
      // Extract the date from the timeSlot if it contains "Daily Lessons"
      let lessonDate = new Date().toISOString().split('T')[0];

      // If this is a daily lesson, try to parse the date from the timeSlot
      if (timeSlot.includes('Daily Lessons')) {
        // The timeSlot format is "Daily Lessons - Mon, Jan 15"
        // We need to extract and parse this date
        const dateMatch = timeSlot.match(/Daily Lessons - (.+)/);
        if (dateMatch) {
          const dateStr = dateMatch[1];
          // Add the current year to the date string
          const currentYear = new Date().getFullYear();
          const parsedDate = new Date(`${dateStr}, ${currentYear}`);
          if (!isNaN(parsedDate.getTime())) {
            lessonDate = parsedDate.toISOString().split('T')[0];
          }
        }
      }

      console.log('Saving lesson with date:', lessonDate); // Add logging

      const response = await fetch('/api/save-lesson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeSlot,
          students,
          content,
          lessonDate,
          schoolSite: schoolSite || null,
          notes: notes.trim() || null
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Save lesson error:', errorData);
        throw new Error('Failed to save lesson');
      }

      const data = await response.json();

      setSaved(true);

      // Call the onSave callback if provided
      if (onSave && data.lesson) {
        onSave(data.lesson);
      }

      // Reset saved indicator after 3 seconds
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error saving lesson:", error);
      alert("Failed to save lesson. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

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
          <title>Lesson Plan - ${timeSlot}</title>
          ${styles}
        </head>
        <body>
          <div class="print-header" style="margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            <h1 style="margin: 0;">Special Education Lesson Plan</h1>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${timeSlot}</p>
            <p style="margin: 5px 0;"><strong>Students:</strong> ${students.map(s => `${s.initials} (Grade ${s.grade_level})`).join(', ')}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            ${notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${notes}</p>` : ''}
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
    }, 250);
  };

  const handlePrintWorksheet = async (studentId: string, studentInitials: string, gradeLevel: string, subject: 'math' | 'ela') => {
    try {
      console.log('Generating worksheet for:', { studentInitials, gradeLevel, subject });

      const generator = new WorksheetGenerator();

      // Extract session time from the timeSlot prop
      let sessionTime = '';
      let sessionDate = new Date();

      // TODO: Connect lessonId from saved lessons
      // When a lesson is saved, store its ID and pass it here:
      // lessonId: savedLessonId || undefined
      // This will enable tracking worksheets back to their source lessons
      // for analytics and student performance tracking

      // Check if this is a daily lesson or single session
      if (timeSlot.includes('Daily Lessons')) {
        // For daily lessons, use the current time slot being viewed
        sessionTime = 'Daily Practice';
        // Extract date from timeSlot like "Daily Lessons - Tue, Jul 8"
        const dateMatch = timeSlot.match(/Daily Lessons - (.+)/);
        if (dateMatch) {
          sessionDate = new Date(dateMatch[1] + ', ' + new Date().getFullYear());
        }
      } else {
        // For single sessions, use the time slot directly
        sessionTime = timeSlot;
      }

      // Generate worksheet with session context
      const worksheetData = await generator.generateWorksheet({
        studentName: studentInitials,
        subject: subject,
        gradeLevel: gradeLevel as any,
        sessionDate: sessionDate,
        sessionTime: sessionTime // Add this new field
      });

      if (!worksheetData || worksheetData.length === 0) {
        console.error('No worksheet data generated');
        alert('Failed to generate worksheet - no data returned');
        return;
      }

      // Convert data URI to blob
      const base64Data = worksheetData.split(',')[1];
      const binaryData = atob(base64Data);
      const arrayBuffer = new ArrayBuffer(binaryData.length);
      const uint8Array = new Uint8Array(arrayBuffer);

      for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
      }

      const blob = new Blob([uint8Array], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      // Open PDF in new window
      const printWindow = window.open(blobUrl, '_blank');

      if (printWindow) {
        // Clean up the blob URL after a delay
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 1000);
      } else {
        // If popup blocked, try direct download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${studentInitials}_Grade${gradeLevel}_${subject.toUpperCase()}_Worksheet.pdf`;
        link.click();

        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 1000);
      }
    } catch (error) {
      console.error('Error generating worksheet:', error);
      alert('Failed to generate worksheet: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">AI Lesson Content</h2>
            <p className="text-sm text-gray-600 mt-1">
              {timeSlot} • {students.length} students: {students.map(s => s.initials).join(', ')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6" ref={printRef}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mb-4"></div>
              <p className="text-gray-600">Generating lesson content...</p>
              <p className="text-sm text-gray-500 mt-2">This may take a few moments...</p>
            </div>
          ) : content ? (
      <>
        <div className="prose max-w-none">
          <div dangerouslySetInnerHTML={sanitizedContent || { __html: '' }} />
        </div>
        {/* Add worksheet buttons for each student */}
        <div className="mt-6 border-t pt-4">
          <h4 className="text-lg font-semibold mb-3">Print Worksheets</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {students.map((student) => (
              <div key={student.id} className="border rounded-lg p-3 bg-gray-50">
                <p className="font-medium mb-2">{student.initials} (Grade {student.grade_level})</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePrintWorksheet(student.id, student.initials, student.grade_level, 'math')}
                    className="flex-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors"
                  >
                    Math Worksheet
                  </button>
                  <button
                    onClick={() => handlePrintWorksheet(student.id, student.initials, student.grade_level, 'ela')}
                    className="flex-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded transition-colors"
                  >
                    ELA Worksheet
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No content generated yet.
            </div>
          )}
        </div>

        {/* Notes section */}
        {content && showNotes && (
          <div className="border-t border-gray-200 px-6 py-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Add notes (optional):
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this lesson..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={2}
            />
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {saved && (
              <span className="text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                Lesson saved successfully!
              </span>
            )}
            {!saved && content && !isViewingSaved && "Tip: Save this lesson to access it later."}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Close
            </button>
            {content && !isViewingSaved && !hideControls && (  // Add !hideControls condition here
              <>
                <button
                  onClick={() => setShowNotes(!showNotes)}
                  className="px-4 py-2 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
                >
                  {showNotes ? 'Hide Notes' : 'Add Notes'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || saved}
                  className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
                    saved 
                      ? 'bg-green-500 text-white' 
                      : 'bg-purple-500 hover:bg-purple-600 text-white'
                  } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {saved ? (
                    <>
                      <Check className="w-4 h-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : 'Save Lesson'}
                    </>
                  )}
                </button>
              </>
            )}
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-md transition-colors flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}