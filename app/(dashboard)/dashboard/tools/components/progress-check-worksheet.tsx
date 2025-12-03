'use client';

import { PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { QuestionRenderer, generateQuestionHTML, type QuestionData, type GoalSubject } from '@/lib/shared/question-renderer';
import { classifySingleGoal } from '@/lib/utils/subject-classifier';
import {
  generatePrintDocument,
  escapeHtml,
} from '@/lib/shared/print-styles';
import { getFluencyInstruction } from '@/lib/shared/question-types';

interface AnswerFormat {
  lines?: number;
  drawing_space?: boolean;
}

interface AssessmentItem {
  type: 'multiple_choice' | 'short_answer' | 'problem';
  prompt: string;
  options?: string[];
  answer_format?: AnswerFormat;
}

interface IEPGoalAssessment {
  goal: string;
  passage?: string; // Top-level passage for reading comprehension goals
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

/**
 * Helper to determine goal subject for consistent section formatting
 */
function getGoalSubject(goalText: string): GoalSubject {
  const classification = classifySingleGoal(goalText);
  if (classification.isMath && !classification.isELA) return 'math';
  if (classification.isELA && !classification.isMath) return 'ela';
  // If both or neither, default to null (use content-based detection)
  return null;
}

export default function ProgressCheckWorksheet({ worksheets, onClose }: ProgressCheckWorksheetProps) {
  const handlePrint = () => {
    // Generate print HTML using shared utilities
    const generatePrintHTML = () => {
      const worksheetsHTML = worksheets.map((worksheet) => {
        const { studentInitials, gradeLevel, iepGoals } = worksheet;

        // Convert worksheet header to shared format
        const headerHTML = `
          <div class="worksheet-header">
            <div class="worksheet-title">Progress Check</div>
            <div class="student-info">
              <div class="info-field">Student: ${escapeHtml(studentInitials)}${gradeLevel ? ` (Grade ${gradeLevel})` : ''}</div>
              <div class="info-field">Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </div>
          </div>
        `;

        // Instructions
        const instructionsHTML = `
          <div class="section-instructions">
            <strong>Instructions:</strong> Complete all questions and problems below. Show your work where applicable. Read each question carefully before answering.
          </div>
        `;

        // Convert assessment items to QuestionData format and generate HTML
        const sectionsHTML = iepGoals.map((goalAssessment, goalIndex) => {
          let itemsHTML = '';
          let questionNumber = 1;

          // Determine goal subject for consistent section formatting
          const goalSubject = getGoalSubject(goalAssessment.goal);

          // Handle goal-level passage
          if (goalAssessment.passage) {
            if (goalAssessment.assessmentItems.length === 0) {
              // Fluency assessment - show passage with teacher instruction (no questions for student)
              // Teachers will grade fluency criteria on the results page
              const fluencyInstruction = getFluencyInstruction(goalAssessment.goal);
              itemsHTML += `
                <div class="reading-fluency-section">
                  <div class="fluency-instruction">
                    <strong>${escapeHtml(fluencyInstruction)}</strong>
                  </div>
                  <div class="fluency-passage">${escapeHtml(goalAssessment.passage)}</div>
                </div>
              `;
            } else {
              // Regular reading comprehension - show passage normally
              const passageQuestion: QuestionData = {
                type: 'passage',
                content: goalAssessment.passage
              };
              itemsHTML += generateQuestionHTML(passageQuestion, undefined, false, goalSubject);
            }
          }

          goalAssessment.assessmentItems.forEach((item) => {
            // Convert item to QuestionData
            const questionData: QuestionData = {
              type: item.type || 'short-answer',
              content: item.prompt,
              choices: item.options,
              blankLines: item.answer_format?.lines,
            };

            itemsHTML += generateQuestionHTML(questionData, questionNumber++, true, goalSubject);
          });

          return `
            <div class="worksheet-section">
              <div class="section-title">Section ${goalIndex + 1}</div>
              ${itemsHTML}
            </div>
          `;
        }).join('');

        return `
          <div class="page-break-after">
            ${headerHTML}
            ${instructionsHTML}
            ${sectionsHTML}
          </div>
        `;
      }).join('');

      // Use shared print document generator
      return generatePrintDocument({
        title: `Progress Checks - ${new Date().toLocaleDateString('en-US')}`,
        content: worksheetsHTML,
      });
    };

    // Create hidden iframe for printing (Exit Ticket pattern)
    const printHTML = generatePrintHTML();
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error('Unable to access iframe document');
      }

      iframeDoc.write(printHTML);
      iframeDoc.close();

      // Wait for content to load then print
      const printAndCleanup = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (error) {
          console.error('Failed to print:', error);
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }
      };

      if (iframe.contentWindow?.document.readyState === 'complete') {
        printAndCleanup();
      } else {
        iframe.onload = printAndCleanup;
      }
    } catch (error) {
      console.error('Error creating print document:', error);
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      // Fallback to window.print if iframe fails
      window.print();
    }
  };

  // Convert assessment item to QuestionData format for rendering
  const convertItemToQuestionData = (item: AssessmentItem): QuestionData => {
    return {
      type: item.type || 'short-answer',
      content: item.prompt,
      choices: item.options,
      blankLines: item.answer_format?.lines,
    };
  };

  const renderWorksheetContent = (worksheet: Worksheet) => (
    <>
      {/* Worksheet Header */}
      <div className="mb-6 pb-4 border-b-2 border-gray-300">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Progress Check
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
            <p className="text-sm text-gray-600">Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
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
      {worksheet.iepGoals.map((goalAssessment, goalIndex) => {
        // Determine goal subject for consistent section formatting
        const goalSubject = getGoalSubject(goalAssessment.goal);

        return (
          <div key={goalIndex} className="mb-8">
            {/* Section Header */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Section {goalIndex + 1}
              </h3>
            </div>

            {/* Goal-level passage (for reading comprehension or fluency) */}
            {goalAssessment.passage && (
              <div className="mb-4">
                {goalAssessment.assessmentItems.length === 0 ? (
                  // Fluency assessment - show passage with teacher instruction (no questions for student)
                  // Teachers will grade fluency criteria on the results page
                  <div className="reading-fluency-section">
                    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4 rounded">
                      <p className="text-sm font-medium text-amber-900">
                        {getFluencyInstruction(goalAssessment.goal)}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded">
                      <p
                        className="text-gray-800 leading-relaxed whitespace-pre-wrap"
                        style={{ lineHeight: '2' }}
                      >
                        {goalAssessment.passage}
                      </p>
                    </div>
                  </div>
                ) : (
                  // Regular reading comprehension - show passage normally
                  <QuestionRenderer
                    question={{ type: 'passage', content: goalAssessment.passage }}
                    showNumber={false}
                    goalSubject={goalSubject}
                  />
                )}
              </div>
            )}

            {/* Assessment Items for this Goal using QuestionRenderer */}
            {goalAssessment.assessmentItems.length > 0 && (
              <div className="ml-2">
                {goalAssessment.assessmentItems.map((item, itemIndex) => (
                  <QuestionRenderer
                    key={itemIndex}
                    question={convertItemToQuestionData(item)}
                    questionNumber={itemIndex + 1}
                    showNumber={true}
                    goalSubject={goalSubject}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
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
