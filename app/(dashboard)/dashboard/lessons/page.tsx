'use client';

import { useState } from 'react';
import { BookOpenIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import { ToastProvider } from '@/app/contexts/toast-context';
import LessonBuilder from './components/lesson-builder';
import LessonBank from './components/lesson-bank';

export default function LessonsPage() {
  const [activeTab, setActiveTab] = useState<'builder' | 'bank'>('builder');

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Lessons</h1>
          <p className="mt-2 text-gray-600">Create AI-generated worksheets and manage your lesson library</p>
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
              <button
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
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow p-6">
          {activeTab === 'builder' && <LessonBuilder />}
          {activeTab === 'bank' && <LessonBank />}
        </div>
      </div>
    </div>
    </ToastProvider>
  );
}