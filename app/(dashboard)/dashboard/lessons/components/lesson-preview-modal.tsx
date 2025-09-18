'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, DocumentArrowDownIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { createClient } from '@/lib/supabase/client';
import { 
  generateWorksheetId, 
  generateAIWorksheetHtml,
  printHtmlWorksheet 
} from '@/lib/utils/worksheet-utils';

interface LessonPreviewModalProps {
  lesson: {
    content: any;
    title: string;
    formData: {
      studentIds: string[];
      subjectType?: 'ela' | 'math' | '';
      topic: string;
      timeDuration: string;
    };
    lessonId?: string;
  };
  formData: any;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function LessonPreviewModal({ 
  lesson, 
  formData, 
  onClose, 
  showToast 
}: LessonPreviewModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'worksheets'>('overview');
  const supabase = createClient();

  // Function to render JSON content as readable HTML
  const renderLessonContent = () => {
    const content = lesson.content;
    
    if (!content) {
      return <p className="text-gray-500">No content available</p>;
    }

    // If it's already structured lesson data
    if (content.lesson) {
      const lessonData = content.lesson;
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold">{lessonData.title || lesson.title}</h3>
            <p className="text-gray-600">Duration: {lessonData.duration || formData.timeDuration} minutes</p>
          </div>
          
          {lessonData.overview && (
            <div>
              <h4 className="font-semibold mb-2">Overview</h4>
              <p className="text-gray-700">{lessonData.overview}</p>
            </div>
          )}
          
          {lessonData.objectives && (
            <div>
              <h4 className="font-semibold mb-2">Learning Objectives</h4>
              <ul className="list-disc pl-5 space-y-1">
                {lessonData.objectives.map((obj: string, i: number) => (
                  <li key={i} className="text-gray-700">{obj}</li>
                ))}
              </ul>
            </div>
          )}

          {lessonData.materials && (
            <div>
              <h4 className="font-semibold mb-2">Materials Needed</h4>
              <p className="text-gray-700">{lessonData.materials}</p>
            </div>
          )}

          {lessonData.introduction && (
            <div>
              <h4 className="font-semibold mb-2">Introduction ({lessonData.introduction.duration} min)</h4>
              <p className="text-gray-700 mb-2">{lessonData.introduction.description}</p>
              <ul className="list-disc pl-5 space-y-1">
                {lessonData.introduction.instructions?.map((inst: string, i: number) => (
                  <li key={i} className="text-gray-700">{inst}</li>
                ))}
              </ul>
            </div>
          )}

          {lessonData.mainActivity && (
            <div>
              <h4 className="font-semibold mb-2">Main Activity ({lessonData.mainActivity.duration} min)</h4>
              <p className="text-gray-700 mb-2">{lessonData.mainActivity.description}</p>
              <ul className="list-disc pl-5 space-y-1">
                {lessonData.mainActivity.instructions?.map((inst: string, i: number) => (
                  <li key={i} className="text-gray-700">{inst}</li>
                ))}
              </ul>
            </div>
          )}

          {lessonData.closure && (
            <div>
              <h4 className="font-semibold mb-2">Closure ({lessonData.closure.duration} min)</h4>
              <p className="text-gray-700 mb-2">{lessonData.closure.description}</p>
              <ul className="list-disc pl-5 space-y-1">
                {lessonData.closure.instructions?.map((inst: string, i: number) => (
                  <li key={i} className="text-gray-700">{inst}</li>
                ))}
              </ul>
            </div>
          )}
          
          {content.studentMaterials && content.studentMaterials.length > 0 && (
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-lg">Student Worksheets</h4>
                <button
                  onClick={async () => {
                    for (let idx = 0; idx < content.studentMaterials.length; idx++) {
                      const material = content.studentMaterials[idx];
                      await handlePrintWorksheet(material.studentId || formData.studentIds[idx], idx);
                      // Small delay between prints to avoid overwhelming the browser
                      await new Promise(resolve => setTimeout(resolve, 500));
                    }
                  }}
                  className="inline-flex items-center px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
                  title="Print all student worksheets"
                >
                  <PrinterIcon className="h-4 w-4 mr-1" />
                  Print All Worksheets
                </button>
              </div>
              {content.studentMaterials.map((material: any, idx: number) => (
                <div key={idx} className="mb-6 bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="font-semibold">
                      Student {idx + 1} (Grade {material.gradeGroup})
                    </h5>
                    <button
                      onClick={() => handlePrintWorksheet(material.studentId || formData.studentIds[idx], idx)}
                      className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                      title="Print this student's worksheet"
                    >
                      <PrinterIcon className="h-4 w-4 mr-1" />
                      Print Worksheet
                    </button>
                  </div>
                  {renderWorksheet(material.worksheet)}
                </div>
              ))}
            </div>
          )}

          {lessonData.answerKey && (
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-2">Answer Key</h4>
              <div className="bg-yellow-50 p-4 rounded-lg">
                {Object.entries(lessonData.answerKey).map(([key, value]: [string, any]) => (
                  <div key={key}>
                    <p className="font-medium">{key}:</p>
                    <p className="text-gray-700">
                      {Array.isArray(value.answers) 
                        ? value.answers.join(', ')
                        : JSON.stringify(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    
    // Fallback for other content structures
    return (
      <div className="prose max-w-none">
        <pre className="whitespace-pre-wrap text-sm">
          {JSON.stringify(content, null, 2)}
        </pre>
      </div>
    );
  };

  const renderWorksheet = (worksheet: any) => {
    if (!worksheet) return null;
    
    return (
      <div className="space-y-4">
        {worksheet.title && <h5 className="font-medium text-lg">{worksheet.title}</h5>}
        {worksheet.instructions && <p className="text-gray-600 italic mb-4">{worksheet.instructions}</p>}
        
        {worksheet.sections?.map((section: any, i: number) => {
          // Handle nested structure with items array containing section objects
          if (section.items && Array.isArray(section.items) && section.items[0]?.sectionType) {
            return (
              <div key={i} className="space-y-4">
                <h6 className="font-semibold text-base">{section.title}</h6>
                {section.instructions && <p className="text-sm text-gray-600">{section.instructions}</p>}
                
                {section.items.map((subSection: any, j: number) => (
                  <div key={j} className="ml-4 space-y-2">
                    <p className="font-medium">{subSection.sectionTitle}</p>
                    {subSection.instructions && (
                      <p className="text-sm text-gray-600 italic">{subSection.instructions}</p>
                    )}
                    <div className="space-y-3">
                      {subSection.items?.map((problem: any, k: number) => (
                        <div key={k} className="ml-4">
                          {problem.type === 'visual' ? (
                            <div className="font-mono text-lg bg-white p-2 rounded border">
                              {problem.content}
                            </div>
                          ) : (
                            <p className="text-gray-700">
                              {k + 1}. {problem.question || problem.content || problem}
                            </p>
                          )}
                          {problem.blankLines && (
                            <div className="ml-4 space-y-1">
                              {[...Array(problem.blankLines)].map((_, idx) => (
                                <div key={idx} className="border-b border-gray-300 h-6"></div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          
          // Handle simpler structure
          return (
            <div key={i} className="space-y-2">
              {section.title && <h6 className="font-medium">{section.title}</h6>}
              {section.instructions && <p className="text-sm text-gray-600">{section.instructions}</p>}
              {section.items && (
                <div className="space-y-2">
                  {section.items.map((item: any, j: number) => (
                    <div key={j} className="ml-4">
                      {typeof item === 'string' ? (
                        <p>{j + 1}. {item}</p>
                      ) : item.type === 'visual' ? (
                        <div className="font-mono text-lg bg-white p-2 rounded border">
                          {item.content}
                        </div>
                      ) : (
                        <p>{j + 1}. {item.question || item.content}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        
        {worksheet.accommodations && worksheet.accommodations.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded">
            <p className="text-sm font-medium">Accommodations:</p>
            <ul className="text-sm text-gray-700">
              {worksheet.accommodations.map((acc: string, i: number) => (
                <li key={i}>• {acc}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast('You must be logged in to save lessons', 'error');
        return;
      }

      // Since the lesson is already saved during generation, we just need to confirm
      if (lesson.lessonId) {
        showToast('Lesson already saved!', 'success');
        onClose();
      } else {
        // Fallback: save manually if for some reason it wasn't saved during generation
        showToast('Lesson saved during generation', 'info');
        onClose();
      }
    } catch (error) {
      showToast('Failed to save lesson. Please try again.', 'error');
      console.error('Error saving lesson:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintWorksheet = async (studentId: string, studentIdx: number) => {
    try {
      const content = lesson.content;
      if (!content?.studentMaterials) {
        showToast('No worksheet available for this student', 'error');
        return;
      }

      const studentMaterial = content.studentMaterials.find((m: any) => 
        m.studentId === studentId || content.studentMaterials[studentIdx] === m
      );

      if (!studentMaterial) {
        showToast('No worksheet found for this student', 'error');
        return;
      }

      // Derive subject from subjectType
      const subject = formData.subjectType === 'ela' ? 'ELA' : formData.subjectType === 'math' ? 'Math' : 'Lesson';

      // Generate unique worksheet ID
      const worksheetId = generateWorksheetId(studentId, subject);

      // Get student initials (for now using Student # as we don't have the actual initials in this context)
      const studentInitials = `Student ${studentIdx + 1}`;

      // Generate HTML for the worksheet with subject handling
      const subjectType = formData.subjectType as 'math' | 'ela' | undefined;

      const html = await generateAIWorksheetHtml(
        studentMaterial,
        studentInitials,
        worksheetId,
        subjectType
      );

      if (html) {
        printHtmlWorksheet(html, `${studentInitials}_${subject}_Worksheet`);
      } else {
        showToast('Failed to generate worksheet', 'error');
      }
    } catch (error) {
      console.error('Error printing worksheet:', error);
      showToast('Failed to print worksheet', 'error');
    }
  };

  const handlePrint = async () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Please allow popups to print the lesson', 'error');
      return;
    }

    // Show loading message while fetching rendered content
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Loading Lesson...</title>
        </head>
        <body>
          <p>Loading lesson plan...</p>
        </body>
      </html>
    `);
    printWindow.document.close();

    try {
      // Fetch the server-rendered HTML
      const response = await fetch(`/api/lessons/${lesson.id}/render?type=lesson`);
      if (!response.ok) {
        throw new Error('Failed to fetch lesson for printing');
      }

      const html = await response.text();

      // Replace the loading message with the rendered HTML
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      // Set the title and trigger print
      printWindow.document.title = lesson.title || 'Lesson Plan';

      // Wait for content to render before printing
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch (error) {
      console.error('Error printing lesson:', error);
      showToast('Failed to print lesson plan', 'error');
      printWindow.close();
    }
  };

  return (
    <Transition.Root show={true} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6">
                <div className="absolute right-0 top-0 pr-4 pt-4">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-2xl font-semibold leading-6 text-gray-900 mb-4">
                      Lesson Preview
                    </Dialog.Title>
                    
                    {/* Lesson Content */}
                    <div id="lesson-preview-content" className="mt-4 max-h-[600px] overflow-y-auto bg-gray-50 p-4 rounded-lg">
                      {renderLessonContent()}
                    </div>

                    {/* Lesson Details */}
                    <div className="mt-4 bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <strong>Subject:</strong> {formData.subjectType === 'ela' ? 'ELA' : formData.subjectType === 'math' ? 'Math' : 'N/A'} |
                        <strong> Topic:</strong> {formData.topic} |
                        <strong> Duration:</strong> {formData.timeDuration}
                      </p>
                      <p className="text-sm text-gray-700 mt-1">
                        <strong>Students:</strong> {formData.studentIds.length} selected
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:w-auto disabled:bg-gray-300"
                  >
                    {isSaving ? 'Confirming...' : 'Confirm Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex w-full justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 sm:w-auto"
                    title="Print the complete lesson plan for the teacher"
                  >
                    <DocumentArrowDownIcon className="h-5 w-5 mr-1" />
                    Print Lesson Plan
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}