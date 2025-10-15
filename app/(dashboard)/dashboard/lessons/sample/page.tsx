'use client';

import { useState } from 'react';
import { BeakerIcon, ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import SampleLessonForm from './sample-lesson-form';
import WorksheetRenderer from './worksheet-renderer';
import { printV2Worksheet, printLessonPlan } from './print-utils';

/**
 * Sample Lessons - Template-Based Generation (DEV ONLY)
 *
 * This page demonstrates the new v2 template-based worksheet generation system.
 * It exists alongside the production AI Lesson Builder to allow side-by-side
 * comparison and validation before migrating the main system.
 */
export default function SampleLessonsPage() {
  const [generatedContent, setGeneratedContent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'worksheet' | 'lessonPlan'>('worksheet');

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Page Not Available</h1>
          <p className="mt-2 text-gray-600">This page is only available in development mode.</p>
          <Link href="/dashboard/lessons" className="mt-4 inline-block text-blue-600 hover:text-blue-800">
            ← Back to Lessons
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with back link */}
        <div className="mb-8">
          <Link
            href="/dashboard/lessons"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back to Lessons
          </Link>

          <div className="flex items-center gap-3">
            <BeakerIcon className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Sample Lessons
                <span className="ml-3 text-sm font-normal text-purple-600 bg-purple-100 px-3 py-1 rounded-full">
                  DEV ONLY
                </span>
              </h1>
              <p className="mt-2 text-gray-600">
                Template-based worksheet generation (v2) - For testing and comparison
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Generate Sample Lesson
            </h2>
            <SampleLessonForm onGenerate={setGeneratedContent} />
          </div>

          {/* Preview/Results */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Generated Content
              </h2>
              {generatedContent && (
                <button
                  onClick={() => {
                    if (activeTab === 'worksheet') {
                      printV2Worksheet(generatedContent.worksheet);
                    } else {
                      printLessonPlan(generatedContent.lessonPlan);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                >
                  <PrinterIcon className="w-4 h-4" />
                  Print {activeTab === 'worksheet' ? 'Worksheet' : 'Lesson Plan'}
                </button>
              )}
            </div>

            {/* Tabs (when lesson plan is available) */}
            {generatedContent && generatedContent.lessonPlan && (
              <div className="border-b border-gray-200 mb-4">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('worksheet')}
                    className={`
                      ${activeTab === 'worksheet'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                      whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm
                    `}
                  >
                    Worksheet
                  </button>
                  <button
                    onClick={() => setActiveTab('lessonPlan')}
                    className={`
                      ${activeTab === 'lessonPlan'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                      whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm
                    `}
                  >
                    Lesson Plan
                  </button>
                </nav>
              </div>
            )}

            {generatedContent ? (
              <div className="space-y-6">
                {/* Metrics Banner */}
                <div className="border-l-4 border-green-500 bg-green-50 p-4 rounded">
                  <h3 className="text-sm font-medium text-green-800 mb-2">
                    Generation Successful ✓
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs text-green-700">
                    <div>
                      <span className="font-medium">Tokens:</span>{' '}
                      {generatedContent.metadata?.totalTokens || 'N/A'} total
                      <span className="text-green-600 ml-1">
                        ({generatedContent.metadata?.promptTokens || 0} prompt + {generatedContent.metadata?.completionTokens || 0} completion)
                      </span>
                      {generatedContent.metadata?.worksheetTokens && generatedContent.metadata?.lessonPlanTokens && (
                        <div className="text-green-600 ml-1 mt-1">
                          Breakdown: {generatedContent.metadata.worksheetTokens} worksheet + {generatedContent.metadata.lessonPlanTokens} lesson plan
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Time:</span>{' '}
                      {((generatedContent.metadata?.generationTime || 0) / 1000).toFixed(1)}s
                    </div>
                  </div>
                </div>

                {/* Content Display - Worksheet or Lesson Plan */}
                {activeTab === 'worksheet' ? (
                  generatedContent.worksheet ? (
                    <WorksheetRenderer worksheet={generatedContent.worksheet} />
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <p className="text-sm text-yellow-800">
                        Worksheet data is missing. Showing raw content instead.
                      </p>
                      <pre className="text-xs text-gray-600 overflow-auto max-h-96 mt-2">
                        {JSON.stringify(generatedContent, null, 2)}
                      </pre>
                    </div>
                  )
                ) : (
                  /* Lesson Plan Display */
                  generatedContent.lessonPlan ? (
                    <div className="space-y-6 text-sm">
                      {/* Lesson Header */}
                      <div className="border-b pb-4">
                        <h3 className="text-lg font-bold text-gray-900">{generatedContent.lessonPlan.title}</h3>
                        <div className="mt-2 flex gap-4 text-xs text-gray-600">
                          <span>Grade: {generatedContent.lessonPlan.gradeLevel}</span>
                          <span>Duration: {generatedContent.lessonPlan.duration} minutes</span>
                          <span>Topic: {generatedContent.lessonPlan.topic}</span>
                        </div>
                      </div>

                      {/* Learning Objectives */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Learning Objectives</h4>
                        <ul className="list-disc list-inside space-y-1 text-gray-700">
                          {generatedContent.lessonPlan.objectives.map((obj: string, i: number) => (
                            <li key={i}>{obj}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Teaching Steps */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Teaching Steps</h4>
                        <ol className="space-y-3">
                          {generatedContent.lessonPlan.teachingSteps.map((step: any, i: number) => (
                            <li key={i} className="flex gap-3">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-medium">
                                {step.step}
                              </span>
                              <span className="text-gray-700 flex-1">{step.instruction}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Guided Practice */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Guided Practice</h4>
                        <ul className="list-disc list-inside space-y-1 text-gray-700">
                          {generatedContent.lessonPlan.guidedPractice.map((practice: string, i: number) => (
                            <li key={i}>{practice}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <p className="text-sm text-yellow-800">
                        Lesson plan data is missing.
                      </p>
                    </div>
                  )
                )}

                {/* Debug Toggle */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                    Show raw JSON (debug)
                  </summary>
                  <pre className="text-xs text-gray-600 overflow-auto max-h-96 mt-2 bg-gray-50 p-4 rounded">
                    {JSON.stringify(generatedContent, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                <BeakerIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No worksheet generated yet.</p>
                <p className="text-sm mt-1">Fill out the form and click "Generate" to create a worksheet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
