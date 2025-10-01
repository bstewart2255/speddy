'use client';

import { PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface AssessmentItem {
  type: 'multiple_choice' | 'short_answer' | 'problem' | 'observation';
  prompt: string;
  options?: string[];
  scoringNotes?: string;
}

interface IEPGoalAssessment {
  goal: string;
  assessmentItems: AssessmentItem[];
}

interface Worksheet {
  studentId: string;
  studentInitials: string;
  iepGoals: IEPGoalAssessment[];
}

interface ProgressCheckWorksheetProps {
  worksheets: Worksheet[];
  onClose: () => void;
}

export default function ProgressCheckWorksheet({ worksheets, onClose }: ProgressCheckWorksheetProps) {
  const handlePrint = () => {
    window.print();
  };

  const renderAssessmentItem = (item: AssessmentItem, itemIndex: number) => {
    const { type, prompt, options, scoringNotes } = item;

    return (
      <div key={itemIndex} className="mb-4 pl-4">
        <div className="mb-2">
          <span className="font-medium text-gray-700">{itemIndex + 1}. </span>
          <span className="text-gray-800">{prompt}</span>
        </div>

        {type === 'multiple_choice' && options && options.length > 0 && (
          <div className="ml-6 space-y-1">
            {options.map((option, optIdx) => (
              <div key={optIdx} className="flex items-center">
                <span className="w-6 h-6 border-2 border-gray-300 rounded mr-2"></span>
                <span className="text-gray-700">{option}</span>
              </div>
            ))}
          </div>
        )}

        {type === 'short_answer' && (
          <div className="ml-6 mt-2">
            <div className="border-b-2 border-gray-300 w-full h-8"></div>
            <div className="border-b-2 border-gray-300 w-full h-8 mt-2"></div>
          </div>
        )}

        {type === 'problem' && (
          <div className="ml-6 mt-2">
            <div className="border border-gray-300 rounded p-4 min-h-24 bg-gray-50">
              <p className="text-xs text-gray-500">Work space:</p>
            </div>
          </div>
        )}

        {type === 'observation' && scoringNotes && (
          <div className="ml-6 mt-2 p-3 bg-blue-50 border-l-4 border-blue-400">
            <p className="text-xs font-medium text-blue-900 mb-1">Scoring Notes:</p>
            <p className="text-sm text-blue-800">{scoringNotes}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 print:relative print:bg-transparent print:p-0">
      <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col print:max-h-none print:shadow-none print:overflow-visible">
        {/* Header - Hidden in print */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 print:hidden">
          <h2 className="text-2xl font-bold text-gray-900">
            Progress Check Worksheets ({worksheets.length})
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <PrinterIcon className="w-5 h-5" />
              Print All
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Worksheets Content */}
        <div className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
          {worksheets.map((worksheet, worksheetIndex) => (
            <div
              key={worksheet.studentId}
              className="worksheet mb-8 print:mb-0"
            >
              {/* Worksheet Header */}
              <div className="mb-6 pb-4 border-b-2 border-gray-300">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Progress Check Assessment
                </h1>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-lg font-medium text-gray-700">
                      Student: <span className="text-blue-600">{worksheet.studentInitials}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Date: _________________</p>
                    <p className="text-sm text-gray-600 mt-1">Teacher: _________________</p>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="mb-6 p-4 bg-gray-50 border-l-4 border-gray-400 rounded">
                <p className="text-sm text-gray-700">
                  <strong>Instructions:</strong> Complete all assessment items for each IEP goal.
                  Show your work where applicable. For observation items, the teacher will score
                  based on the provided criteria.
                </p>
              </div>

              {/* IEP Goals and Assessment Items */}
              {worksheet.iepGoals.map((goalAssessment, goalIndex) => (
                <div key={goalIndex} className="mb-8">
                  {/* IEP Goal */}
                  <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">
                      IEP Goal {goalIndex + 1}:
                    </h3>
                    <p className="text-sm text-blue-800 italic">
                      {goalAssessment.goal}
                    </p>
                  </div>

                  {/* Assessment Items for this Goal */}
                  <div className="ml-2">
                    {goalAssessment.assessmentItems.map((item, itemIndex) =>
                      renderAssessmentItem(item, itemIndex)
                    )}
                  </div>

                  {/* Teacher Scoring Section */}
                  <div className="mt-4 p-3 bg-gray-50 border border-gray-300 rounded">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-gray-700">Teacher Assessment:</p>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center">
                          <span className="w-5 h-5 border-2 border-gray-400 rounded mr-2"></span>
                          <span className="text-sm text-gray-700">Goal Met</span>
                        </label>
                        <label className="flex items-center">
                          <span className="w-5 h-5 border-2 border-gray-400 rounded mr-2"></span>
                          <span className="text-sm text-gray-700">In Progress</span>
                        </label>
                        <label className="flex items-center">
                          <span className="w-5 h-5 border-2 border-gray-400 rounded mr-2"></span>
                          <span className="text-sm text-gray-700">Not Met</span>
                        </label>
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs text-gray-600 mb-1">Notes:</p>
                      <div className="border-b border-gray-300 h-6"></div>
                      <div className="border-b border-gray-300 h-6 mt-1"></div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Overall Summary Section */}
              <div className="mt-8 p-4 bg-gray-50 border border-gray-300 rounded">
                <h4 className="text-base font-semibold text-gray-900 mb-3">
                  Overall Progress Summary
                </h4>
                <div className="space-y-2">
                  <div className="border-b border-gray-300 h-6"></div>
                  <div className="border-b border-gray-300 h-6"></div>
                  <div className="border-b border-gray-300 h-6"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
