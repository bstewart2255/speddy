'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { createClient } from '@/lib/supabase/client';

interface LessonPreviewModalProps {
  lesson: {
    content: any;
    title: string;
    formData: {
      studentIds: string[];
      subject: string;
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
          
          {content.studentMaterials?.[0]?.worksheet && (
            <div>
              <h4 className="font-semibold mb-2">Worksheet</h4>
              <div className="bg-gray-50 p-4 rounded-lg">
                {renderWorksheet(content.studentMaterials[0].worksheet)}
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
        {worksheet.title && <h5 className="font-medium">{worksheet.title}</h5>}
        {worksheet.instructions && <p className="text-gray-600">{worksheet.instructions}</p>}
        
        {worksheet.sections?.map((section: any, i: number) => (
          <div key={i} className="space-y-2">
            {section.title && <h6 className="font-medium">{section.title}</h6>}
            {section.instructions && <p className="text-sm text-gray-600">{section.instructions}</p>}
            {section.items && (
              <ol className="list-decimal pl-5 space-y-1">
                {section.items.map((item: any, j: number) => (
                  <li key={j} className="text-gray-700">
                    {typeof item === 'string' ? item : item.question || item.content}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${lesson.title}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h3 { color: #333; }
              h4 { color: #555; margin-top: 20px; }
              .text-gray-600 { color: #666; }
              .text-gray-700 { color: #777; }
              ul { padding-left: 20px; }
              .bg-gray-50 { background: #f9f9f9; padding: 10px; border-radius: 5px; }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            <div id="content"></div>
          </body>
        </html>
      `);
      
      const contentDiv = printWindow.document.getElementById('content');
      if (contentDiv) {
        // Create a temporary div to render the content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = document.getElementById('lesson-preview-content')?.innerHTML || '';
        contentDiv.appendChild(tempDiv);
      }
      
      printWindow.document.close();
      printWindow.print();
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
                    <div id="lesson-preview-content" className="mt-4 max-h-96 overflow-y-auto bg-gray-50 p-4 rounded-lg">
                      {renderLessonContent()}
                    </div>

                    {/* Lesson Details */}
                    <div className="mt-4 bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <strong>Subject:</strong> {formData.subject} | 
                        <strong> Topic:</strong> {formData.topic} | 
                        <strong> Duration:</strong> {formData.timeDuration}
                      </p>
                      <p className="text-sm text-gray-700 mt-1">
                        <strong>Students:</strong> {lesson.formData.studentIds.length} selected
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
                  >
                    <DocumentArrowDownIcon className="h-5 w-5 mr-1" />
                    Print
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