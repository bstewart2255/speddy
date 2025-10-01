'use client';

import { PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface AssessmentItem {
  type: 'multiple_choice' | 'short_answer' | 'problem' | 'observation';
  prompt: string;
  passage?: string; // For reading comprehension questions
  options?: string[];
}

interface IEPGoalAssessment {
  goal: string;
  assessmentItems: AssessmentItem[];
}

interface Worksheet {
  studentId: string;
  studentInitials: string;
  gradeLevel?: number;
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

  // Helper function to determine number of lines for short answer questions
  // Students typically need 2-3 lines per sentence for handwriting
  const getLineCount = (item: AssessmentItem): number => {
    const { prompt } = item;

    // Check for explicit paragraph count (e.g., "Write 2 paragraphs")
    const paragraphMatch = prompt.match(/(\d+)\s+paragraph/i);
    if (paragraphMatch) {
      const paragraphCount = parseInt(paragraphMatch[1]);
      // Each paragraph typically needs 8-10 lines
      return Math.min(paragraphCount * 8, 20);
    }

    // Check for explicit sentence count (e.g., "Write 5 sentences")
    const sentenceMatch = prompt.match(/(\d+)(?:-(\d+))?\s+sentence/i);
    if (sentenceMatch) {
      const minCount = parseInt(sentenceMatch[1]);
      const maxCount = sentenceMatch[2] ? parseInt(sentenceMatch[2]) : minCount;
      const avgCount = (minCount + maxCount) / 2;

      // Students need ~2.5 lines per sentence on average, plus 2 extra for safety
      const lineCount = Math.ceil(avgCount * 2.5) + 2;
      return Math.min(lineCount, 20);
    }

    // Check for word count hints (e.g., "Write 50-100 words")
    const wordMatch = prompt.match(/(\d+)(?:-(\d+))?\s+word/i);
    if (wordMatch) {
      const minWords = parseInt(wordMatch[1]);
      const maxWords = wordMatch[2] ? parseInt(wordMatch[2]) : minWords;
      const avgWords = (minWords + maxWords) / 2;

      // Roughly 10-12 words per line of student handwriting
      const lineCount = Math.ceil(avgWords / 10) + 2;
      return Math.min(lineCount, 20);
    }

    // Default based on prompt complexity and length
    if (prompt.length < 50) {
      // Short, simple question: 5 lines
      return 5;
    } else if (prompt.length > 150) {
      // Complex question: 12 lines
      return 12;
    } else {
      // Medium question: 8 lines
      return 8;
    }
  };

  const renderAssessmentItem = (item: AssessmentItem, itemIndex: number) => {
    const { type, prompt, passage, options } = item;

    return (
      <div key={itemIndex} className="mb-6 pl-4">
        {/* Reading Passage (if present) */}
        {passage && (
          <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
            <p className="text-sm font-medium text-blue-900 mb-2">Reading Passage:</p>
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{passage}</p>
          </div>
        )}

        {/* Question */}
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
          <div className="ml-6 mt-2 space-y-2">
            {Array.from({ length: getLineCount(item) }).map((_, idx) => (
              <div key={idx} className="border-b-2 border-gray-300 w-full h-8"></div>
            ))}
          </div>
        )}

        {type === 'problem' && (
          <div className="ml-6 mt-2">
            <div className="border border-gray-300 rounded p-4 min-h-24 bg-gray-50">
              <p className="text-xs text-gray-500">Work space:</p>
            </div>
          </div>
        )}

        {type === 'observation' && (
          <div className="ml-6 mt-2 p-3 bg-gray-50 border-l-2 border-gray-400 rounded">
            <p className="text-sm text-gray-600 italic">
              Teacher will observe and assess this skill.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderWorksheetContent = (worksheet: Worksheet) => (
    <>
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
            {worksheet.gradeLevel && (
              <p className="text-sm text-gray-600 mt-1">Grade: {worksheet.gradeLevel}</p>
            )}
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
          <strong>Instructions:</strong> Complete all questions and problems below.
          Show your work where applicable. Read each question carefully before answering.
        </p>
      </div>

      {/* Assessment Items (without showing IEP goals) */}
      {worksheet.iepGoals.map((goalAssessment, goalIndex) => (
        <div key={goalIndex} className="mb-8">
          {/* Section Header */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Section {goalIndex + 1}
            </h3>
          </div>

          {/* Assessment Items for this Goal */}
          <div className="ml-2">
            {goalAssessment.assessmentItems.map((item, itemIndex) =>
              renderAssessmentItem(item, itemIndex)
            )}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="worksheet-modal-container fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="worksheet-modal bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header - hidden in print */}
        <div className="worksheet-modal-header flex items-center justify-between p-6 border-b border-gray-200">
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

        {/* Worksheets Content - Scrollable preview on screen, flows naturally in print */}
        <div className="worksheet-modal-content flex-1 overflow-y-auto p-6">
          {worksheets.map((worksheet, index) => (
            <div
              key={worksheet.studentId}
              className={`worksheet-page ${index > 0 ? 'mt-8' : ''} ${index < worksheets.length - 1 ? 'mb-8 pb-8 border-b-2 border-gray-200' : ''}`}
            >
              {renderWorksheetContent(worksheet)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
