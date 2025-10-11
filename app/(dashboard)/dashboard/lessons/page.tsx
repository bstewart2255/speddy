'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpenIcon, FolderOpenIcon, TicketIcon, ClipboardDocumentCheckIcon, DocumentTextIcon, BeakerIcon } from '@heroicons/react/24/outline';
import { ToastProvider } from '@/app/contexts/toast-context';
import LessonBuilder from './components/lesson-builder';
import LessonBank from './components/lesson-bank';
import ExitTicketBuilder from './components/exit-ticket-builder';
import ProgressCheck from './components/progress-check';
import SavedWorksheets from './components/saved-worksheets';

export default function LessonsPage() {
  const [activeTab, setActiveTab] = useState<'builder' | 'bank' | 'exit-tickets' | 'progress-check' | 'saved-worksheets'>('builder');

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Lessons</h1>
              <p className="mt-2 text-gray-600">Create AI-generated worksheets and manage your lesson library</p>
            </div>
            {/* DEV ONLY: Link to Sample Lessons */}
            {process.env.NODE_ENV === 'development' && (
              <Link
                href="/dashboard/lessons/sample"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
              >
                <BeakerIcon className="w-5 h-5" />
                <span className="text-sm font-medium">Sample Lessons (v2)</span>
              </Link>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => setActiveTab('builder')}
                className={`
                  flex-1 sm:flex-initial py-4 px-6 text-center border-b-2 font-medium text-sm
                  transition-colors duration-200 flex items-center justify-center gap-2
                  ${activeTab === 'builder'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <BookOpenIcon className="w-5 h-5" />
                AI Lesson Builder
              </button>
              {/* <button
                onClick={() => setActiveTab('bank')}
                className={`
                  flex-1 sm:flex-initial py-4 px-6 text-center border-b-2 font-medium text-sm
                  transition-colors duration-200 flex items-center justify-center gap-2
                  ${activeTab === 'bank'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <FolderOpenIcon className="w-5 h-5" />
                Lesson Bank
              </button> */}
              <button
                onClick={() => setActiveTab('exit-tickets')}
                className={`
                  flex-1 sm:flex-initial py-4 px-6 text-center border-b-2 font-medium text-sm
                  transition-colors duration-200 flex items-center justify-center gap-2
                  ${activeTab === 'exit-tickets'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <TicketIcon className="w-5 h-5" />
                Exit Tickets
              </button>
              <button
                onClick={() => setActiveTab('progress-check')}
                className={`
                  flex-1 sm:flex-initial py-4 px-6 text-center border-b-2 font-medium text-sm
                  transition-colors duration-200 flex items-center justify-center gap-2
                  ${activeTab === 'progress-check'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <ClipboardDocumentCheckIcon className="w-5 h-5" />
                Progress Check
              </button>
              <button
                onClick={() => setActiveTab('saved-worksheets')}
                className={`
                  flex-1 sm:flex-initial py-4 px-6 text-center border-b-2 font-medium text-sm
                  transition-colors duration-200 flex items-center justify-center gap-2
                  ${activeTab === 'saved-worksheets'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <DocumentTextIcon className="w-5 h-5" />
                Saved Worksheets
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow p-6">
          {activeTab === 'builder' && <LessonBuilder />}
          {/* {activeTab === 'bank' && <LessonBank />} */}
          {activeTab === 'exit-tickets' && <ExitTicketBuilder />}
          {activeTab === 'progress-check' && <ProgressCheck />}
          {activeTab === 'saved-worksheets' && <SavedWorksheets />}
        </div>
      </div>
    </div>
    </ToastProvider>
  );
}