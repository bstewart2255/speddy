"use client";

import * as React from "react";
import { X, Printer, Save, Check, ChevronLeft, ChevronRight, Clock, Users, Target, BookOpen, Activity } from "lucide-react";
// DEPRECATED: WorksheetGenerator fallback removed to simplify pipeline (Issue #268)
// import { WorksheetGenerator } from '../../lib/worksheet-generator';
import { formatTimeSlot } from '../../lib/utils/date-time';
import { LessonContentHandler, getPrintableContent, isJsonLesson } from '../../lib/utils/lesson-content-handler';
import {
  generateWorksheetId,
  findStudentWorksheetContent,
  generateAIWorksheetHtml,
  // generateWorksheetQRCode removed - QR codes disabled (Issue #268)
  printHtmlWorksheet
  // printPdfWorksheet removed - no longer using PDF fallback (Issue #268)
} from '../../lib/utils/worksheet-utils';
import '../../app/styles/lesson-content.css';

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
  
  // Check if the content is JSON using centralized function
  const isJsonContent = React.useMemo(() => 
    isJsonLesson(currentLesson?.content ?? null), 
    [currentLesson]
  );

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

  const printSingleLesson = async (includeWorksheets: boolean) => {
    const printContent = printRef.current;
    if (!printContent || !currentLesson) return;

    // Get printable content using the centralized utility
    const printHtml = await getPrintableContent(currentLesson.content, currentLesson.students);

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

    const fullHtml = `
      <html>
        <head>
          <title>Lesson Plan - ${formatTimeSlot(currentLesson.timeSlot)}</title>
          ${styles}
        </head>
        <body>
          <div class="print-header" style="margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            <h1 style="margin: 0;">Lesson Plan</h1>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${lessonDate.toLocaleDateString()}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${escapeHTML(formatTimeSlot(currentLesson.timeSlot))}</p>
            <p style="margin: 5px 0;"><strong>Students:</strong> ${currentLesson.students.map(s => `${escapeHTML(s.initials)} (Grade ${escapeHTML(String(s.grade_level))})`).join(', ')}</p>
            ${notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${escapeHTML(notes)}</p>` : ''}
          </div>
          ${printHtml}
        </body>
      </html>
    `;

    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    
    document.body.appendChild(iframe);
    
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error('Unable to access iframe document');
      }
      
      iframeDoc.write(fullHtml);
      iframeDoc.close();
      
      // Wait for content to load then print
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (printError) {
          console.error('Failed to trigger print dialog:', printError);
        } finally {
          // Remove iframe after a delay
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 1000);
          
          // If user chose to include worksheets, generate them
          if (includeWorksheets) {
            generateWorksheetsForLesson(currentLesson);
          }
        }
      }, 250);
    } catch (error) {
      console.error('Failed to prepare lesson for printing:', error);
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      alert('Unable to prepare lesson for printing. Please try again.');
    }
  };

  const printAllLessons = async () => {
    // Print each lesson as a separate document
    for (let index = 0; index < lessons.length; index++) {
      const lesson = lessons[index];
      
      // Get printable content using the centralized utility
      const printHtml = await getPrintableContent(lesson.content, lesson.students);
      
      setTimeout(() => {
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

        const fullHtml = `
          <html>
            <head>
              <title>Lesson Plan ${index + 1} - ${formatTimeSlot(lesson.timeSlot)}</title>
              ${styles}
            </head>
            <body>
              <div class="print-header" style="margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
                <h1 style="margin: 0;">Lesson Plan</h1>
                <p style="margin: 5px 0;"><strong>Date:</strong> ${lessonDate.toLocaleDateString()}</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${escapeHTML(formatTimeSlot(lesson.timeSlot))}</p>
                <p style="margin: 5px 0;"><strong>Students:</strong> ${lesson.students.map(s => `${escapeHTML(s.initials)} (Grade ${escapeHTML(String(s.grade_level))})`).join(', ')}</p>
              </div>
              ${printHtml}
            </body>
          </html>
        `;

        // Create a hidden iframe for printing
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.visibility = 'hidden';
        
        document.body.appendChild(iframe);
        
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) {
            throw new Error('Unable to access iframe document');
          }
          
          iframeDoc.write(fullHtml);
          iframeDoc.close();
          
          // Wait for content to load then print
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch (printError) {
              console.error('Failed to trigger print dialog:', printError);
            } finally {
              // Remove iframe after a delay
              setTimeout(() => {
                if (iframe.parentNode) {
                  document.body.removeChild(iframe);
                }
              }, 1000);
            }
          }, 250);
        } catch (error) {
          console.error('Failed to prepare lesson for printing:', error);
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }
      }, index * 500); // Delay between windows to prevent blocking
    }
  };

  const generateWorksheetsForLesson = async (lesson: LessonContent) => {
    console.log('[DEBUG] Starting worksheet generation for lesson:', {
      timeSlot: lesson.timeSlot,
      studentCount: lesson.students.length,
      contentLength: lesson.content?.length
    });

    // Generate worksheets for each student in the time slot
    for (const student of lesson.students) {
      console.log('[DEBUG] Processing student:', student.initials, student.id);

      try {
        // Check for AI-generated content using shared utility
        const { studentMaterial, isValid, error } = findStudentWorksheetContent(lesson.content, student.id);
        console.log('[DEBUG] Worksheet search result:', { isValid, error, hasStudentMaterial: !!studentMaterial });

        let aiMathWorksheetHtml: string | null = null;
        let aiElaWorksheetHtml: string | null = null;

        if (isValid && studentMaterial) {
          console.log('Found AI-generated worksheet for student:', student.initials);
          console.log('StudentMaterial structure:', {
            hasWorksheet: !!studentMaterial.worksheet,
            hasWorksheets: !!studentMaterial.worksheets,
            worksheetKeys: studentMaterial.worksheets ? Object.keys(studentMaterial.worksheets) : [],
          });
          
          // Generate unique worksheet IDs and QR codes in parallel for better performance
          const mathWorksheetCode = generateWorksheetId(student.id, 'math');
          const elaWorksheetCode = generateWorksheetId(student.id, 'ela');
          
          // Generate worksheets in parallel with subject-specific content
          const [mathHtml, elaHtml] = await Promise.all([
            generateAIWorksheetHtml(studentMaterial, student.initials, mathWorksheetCode, 'math'),
            generateAIWorksheetHtml(studentMaterial, student.initials, elaWorksheetCode, 'ela')
          ]);

          aiMathWorksheetHtml = mathHtml;
          aiElaWorksheetHtml = elaHtml;

          console.log('[DEBUG] Worksheet HTML generation results:', {
            mathHtmlLength: aiMathWorksheetHtml?.length || 0,
            elaHtmlLength: aiElaWorksheetHtml?.length || 0,
            hasMathHtml: !!aiMathWorksheetHtml,
            hasElaHtml: !!aiElaWorksheetHtml
          });

          if (!aiMathWorksheetHtml && !aiElaWorksheetHtml) {
            console.error('Failed to generate both worksheets despite valid data:', {
              studentId: student.id,
              initials: student.initials,
              materialStructure: studentMaterial
            });
          }
        } else {
          console.log(`No AI worksheet for ${student.initials}: ${error || 'Unknown error'}`);
        }
        
        // Print AI-generated worksheets if available, otherwise show explicit error
        if (aiMathWorksheetHtml || aiElaWorksheetHtml) {
          // Print math worksheet if available
          if (aiMathWorksheetHtml) {
            console.log('[WORKSHEET] Printing Math worksheet HTML for:', student.initials);
            printHtmlWorksheet(aiMathWorksheetHtml, `Math Worksheet - ${student.initials}`);
            await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between prints
          } else {
            // EXPLICIT ERROR - No silent fallback
            console.error(`[WORKSHEET ERROR] Failed to generate Math worksheet for ${student.initials}`);
            alert(`Failed to generate Math worksheet for ${student.initials}. The worksheet content may be missing or incorrectly formatted.`);
          }

          // Print ELA worksheet if available
          if (aiElaWorksheetHtml) {
            console.log('[WORKSHEET] Printing ELA worksheet HTML for:', student.initials);
            printHtmlWorksheet(aiElaWorksheetHtml, `ELA Worksheet - ${student.initials}`);
          } else {
            // EXPLICIT ERROR - No silent fallback
            console.error(`[WORKSHEET ERROR] Failed to generate ELA worksheet for ${student.initials}`);
            alert(`Failed to generate ELA worksheet for ${student.initials}. The worksheet content may be missing or incorrectly formatted.`);
          }
        } else {
          // EXPLICIT ERROR - No fallback to generic worksheets
          const errorMsg = `No AI-generated worksheet content found for ${student.initials}.\n\nThe lesson content may not be in the correct JSON format or is missing student materials.\n\nPlease regenerate the lesson with proper worksheet content.`;
          console.error('[WORKSHEET ERROR]', errorMsg);
          alert(errorMsg);

          /* FALLBACK TO WORKSHEETGENERATOR REMOVED - Issue #268
             The deprecated WorksheetGenerator was creating generic templates that didn't match
             the AI-generated differentiated content. Removing this fallback ensures users
             see actual errors when worksheet generation fails.
          */
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

        {/* Current time slot info with enhanced visual design */}
        {currentLesson && (
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Time Slot</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {formatTimeSlot(currentLesson.timeSlot)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Students</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {currentLesson.students.map((s, idx) => (
                      <span 
                        key={idx}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                      >
                        {s.initials} (Gr {s.grade_level})
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4 bg-gray-50">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : currentLesson ? (
            <div ref={printRef} className="max-w-4xl mx-auto">
              {/* Quick Overview Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5 text-green-600" />
                  Lesson Overview
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-start gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-700">Focus Area</p>
                      <p className="text-gray-600">Special Education Support</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Activity className="w-4 h-4 text-purple-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-700">Duration</p>
                      <p className="text-gray-600">{formatTimeSlot(currentLesson.timeSlot)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users className="w-4 h-4 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-700">Group Size</p>
                      <p className="text-gray-600">{currentLesson.students.length} student{currentLesson.students.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Main Lesson Content */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <LessonContentHandler
                  content={currentLesson.content}
                  students={currentLesson.students}
                  className="lesson-content prose prose-lg max-w-none"
                />
              </div>
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