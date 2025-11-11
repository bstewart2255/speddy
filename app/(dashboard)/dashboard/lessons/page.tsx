'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpenIcon, FolderOpenIcon, TicketIcon, ClipboardDocumentCheckIcon, DocumentTextIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { ToastProvider } from '@/app/contexts/toast-context';
import SampleLessonForm from './sample/sample-lesson-form';
import WorksheetRenderer from './sample/worksheet-renderer';
import { printV2Worksheet, printLessonPlan, type Worksheet } from './sample/print-utils';
import LessonBank from './components/lesson-bank';
import ExitTicketBuilder from './components/exit-ticket-builder';
import ProgressCheck from './components/progress-check';
import SavedWorksheets from './components/saved-worksheets';
import ResultsTab from './components/results-tab';

// Type definition for teaching step
type TeachingStep = {
  step: number;
  instruction: string;
};

// Type definition for generated content
interface GeneratedContent {
  worksheet?: Worksheet;
  lessonPlan?: {
    title: string;
    gradeLevel: string;
    duration: number;
    topic: string;
    objectives: string[];
    teachingSteps: TeachingStep[];
    guidedPractice: string[];
  };
  metadata?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    generationTime?: number;
    model?: string;
    generationVersion?: string;
    worksheetTokens?: number;
    lessonPlanTokens?: number;
  };
  lessonId?: string;
}

export default function LessonsPage() {
  const [activeTab, setActiveTab] = useState<'builder' | 'bank' | 'exit-tickets' | 'progress-check' | 'saved-worksheets' | 'results'>('builder');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [lessonPlanTab, setLessonPlanTab] = useState<'worksheet' | 'lessonPlan'>('worksheet');

  // Handler to reset lesson plan tab when new content is generated
  const handleGenerate = (result: GeneratedContent) => {
    setGeneratedContent(result);
    setLessonPlanTab('worksheet'); // Always reset to worksheet tab
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tools</h1>
              <p className="mt-2 text-gray-600">Create AI-generated worksheets and track student progress</p>
            </div>
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
              <button
                onClick={() => setActiveTab('results')}
                className={`
                  flex-1 sm:flex-initial py-4 px-6 text-center border-b-2 font-medium text-sm
                  transition-colors duration-200 flex items-center justify-center gap-2
                  ${activeTab === 'results'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <ChartBarIcon className="w-5 h-5" />
                Results
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Generate Worksheet
              </h2>
              <SampleLessonForm onGenerate={handleGenerate} />
            </div>

            {/* Preview/Results */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Preview
                </h2>
                {generatedContent && (
                  <button
                    onClick={() => {
                      if (lessonPlanTab === 'worksheet' && generatedContent.worksheet) {
                        printV2Worksheet(generatedContent.worksheet);
                      } else if (lessonPlanTab === 'lessonPlan' && generatedContent.lessonPlan) {
                        printLessonPlan(generatedContent.lessonPlan);
                      }
                    }}
                    disabled={
                      (lessonPlanTab === 'worksheet' && !generatedContent.worksheet) ||
                      (lessonPlanTab === 'lessonPlan' && !generatedContent.lessonPlan)
                    }
                    className="inline-flex items-center gap-2 px-3 py-2 text-white text-sm rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print {lessonPlanTab === 'worksheet' ? 'Worksheet' : 'Lesson Plan'}
                  </button>
                )}
              </div>

              {/* Tabs (when lesson plan is available) */}
              {generatedContent && generatedContent.lessonPlan && (
                <div className="border-b border-gray-200 mb-4">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setLessonPlanTab('worksheet')}
                      className={`
                        ${lessonPlanTab === 'worksheet'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }
                        whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm
                      `}
                    >
                      Worksheet
                    </button>
                    <button
                      onClick={() => setLessonPlanTab('lessonPlan')}
                      className={`
                        ${lessonPlanTab === 'lessonPlan'
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
                  {lessonPlanTab === 'worksheet' ? (
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
                        {(generatedContent.lessonPlan.objectives?.length ?? 0) > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">Learning Objectives</h4>
                            <ul className="list-disc list-inside space-y-1 text-gray-700">
                              {(generatedContent.lessonPlan.objectives ?? []).map((obj: string, i: number) => (
                                <li key={i}>{obj}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Teaching Steps */}
                        {(generatedContent.lessonPlan.teachingSteps?.length ?? 0) > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">Teaching Steps</h4>
                            <div className="space-y-3">
                              {(generatedContent.lessonPlan.teachingSteps ?? []).map((step: TeachingStep, i: number) => (
                                <div key={i} className="flex gap-3">
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-medium">
                                    {step.step}
                                  </span>
                                  <span className="text-gray-700 flex-1">{step.instruction}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Guided Practice */}
                        {(generatedContent.lessonPlan.guidedPractice?.length ?? 0) > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">Guided Practice</h4>
                            <ul className="list-disc list-inside space-y-1 text-gray-700">
                              {(generatedContent.lessonPlan.guidedPractice ?? []).map((practice: string, i: number) => (
                                <li key={i}>{practice}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                        <p className="text-sm text-yellow-800">
                          Lesson plan data is missing.
                        </p>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No worksheet generated yet.</p>
                  <p className="text-sm mt-1">Fill out the form and click "Generate Materials" to create content.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'exit-tickets' && (
          <div className="bg-white rounded-lg shadow p-6">
            <ExitTicketBuilder />
          </div>
        )}

        {activeTab === 'progress-check' && (
          <div className="bg-white rounded-lg shadow p-6">
            <ProgressCheck />
          </div>
        )}

        {activeTab === 'saved-worksheets' && (
          <div className="bg-white rounded-lg shadow p-6">
            <SavedWorksheets />
          </div>
        )}

        {activeTab === 'results' && (
          <div className="bg-white rounded-lg shadow p-6">
            <ResultsTab />
          </div>
        )}
      </div>
    </div>
    </ToastProvider>
  );
}