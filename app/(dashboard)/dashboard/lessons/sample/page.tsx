'use client';

import { useState } from 'react';
import { BeakerIcon, ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import SampleLessonForm from './sample-lesson-form';
import WorksheetRenderer from './worksheet-renderer';
import { printV2Worksheet } from './print-utils';

/**
 * Sample Lessons - Template-Based Generation (DEV ONLY)
 *
 * This page demonstrates the new v2 template-based worksheet generation system.
 * It exists alongside the production AI Lesson Builder to allow side-by-side
 * comparison and validation before migrating the main system.
 */
export default function SampleLessonsPage() {
  const [generatedContent, setGeneratedContent] = useState<any>(null);

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

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <BeakerIcon className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                About Sample Lessons
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>This is a new template-based generation system designed to:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Reduce AI prompt size by ~67% (250 lines → ~80 lines)</li>
                  <li>Improve generation speed and reduce token usage</li>
                  <li>Guarantee 100% structural consistency</li>
                  <li>Lower validation failure rate from 5-10% to &lt;1%</li>
                </ul>
                <p className="mt-2">
                  This exists alongside the production AI Lesson Builder for comparison and validation.
                </p>
              </div>
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
                Generated Worksheet
              </h2>
              {generatedContent && (
                <button
                  onClick={() => printV2Worksheet(generatedContent.worksheet)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                >
                  <PrinterIcon className="w-4 h-4" />
                  Print
                </button>
              )}
            </div>

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
                    </div>
                    <div>
                      <span className="font-medium">Time:</span>{' '}
                      {((generatedContent.metadata?.generationTime || 0) / 1000).toFixed(1)}s
                    </div>
                  </div>
                </div>

                {/* Worksheet Display */}
                {generatedContent.worksheet ? (
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
