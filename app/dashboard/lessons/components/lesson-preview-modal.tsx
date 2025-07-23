'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PrinterIcon, BookmarkIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/app/contexts/toast-context';
import { createClient } from '@/lib/supabase/client';

interface LessonPreviewModalProps {
  lesson: {
    content: string;
    title: string;
  };
  formData: {
    grade: string;
    subject: string;
    topic: string;
    timeDuration: string;
  };
  onClose: () => void;
}

export default function LessonPreviewModal({ lesson, formData, onClose }: LessonPreviewModalProps) {
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Please allow popups to print the lesson', 'error');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${lesson.title} - ${formData.grade} ${formData.subject}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1, h2, h3 {
              color: #2c3e50;
            }
            .header {
              border-bottom: 2px solid #3498db;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .meta-info {
              color: #666;
              font-size: 14px;
              margin-bottom: 20px;
            }
            @media print {
              body {
                margin: 0;
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${lesson.title}</h1>
            <div class="meta-info">
              <strong>Grade:</strong> ${formData.grade} | 
              <strong>Subject:</strong> ${formData.subject} | 
              <strong>Duration:</strong> ${formData.timeDuration}
            </div>
          </div>
          <div class="content">
            ${lesson.content}
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load before printing
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast('You must be logged in to save lessons', 'error');
        return;
      }

      const response = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: lesson.title,
          subject: formData.subject,
          grade: formData.grade,
          time_duration: formData.timeDuration,
          content: lesson.content,
          user_id: user.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save lesson');
      }

      showToast('Lesson saved successfully!', 'success');
      onClose();
    } catch (error) {
      showToast('Failed to save lesson. Please try again.', 'error');
      console.error('Error saving lesson:', error);
    } finally {
      setIsSaving(false);
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
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl">
                <div className="bg-white">
                  {/* Header */}
                  <div className="border-b border-gray-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                          Lesson Preview
                        </Dialog.Title>
                        <p className="mt-1 text-sm text-gray-500">
                          {formData.grade} • {formData.subject} • {formData.timeDuration}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={onClose}
                      >
                        <span className="sr-only">Close</span>
                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="prose max-w-none">
                      <h2 className="text-xl font-semibold mb-4">{lesson.title}</h2>
                      <div 
                        dangerouslySetInnerHTML={{ __html: lesson.content }}
                        className="lesson-content"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t border-gray-200 px-6 py-4">
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={handlePrint}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <PrinterIcon className="w-4 h-4 mr-2" />
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`
                          inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white
                          ${isSaving 
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                          }
                        `}
                      >
                        <BookmarkIcon className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save to Library'}
                      </button>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}