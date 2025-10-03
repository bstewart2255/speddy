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
    // Generate complete HTML document for printing (Exit Ticket pattern)
    const generatePrintHTML = () => {
      // Escape HTML to prevent XSS
      const escapeHtml = (value: unknown) => {
        if (value === null || value === undefined) return '';
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      const worksheetsHTML = worksheets.map((worksheet, wsIndex) => {
        const { studentInitials, gradeLevel, iepGoals } = worksheet;

        // Generate assessment items HTML
        const assessmentHTML = iepGoals.map((goalAssessment, goalIndex) => {
          const itemsHTML = goalAssessment.assessmentItems.map((item, itemIndex) => {
            const { type, prompt, passage, options } = item;
            const lineCount = getLineCount(item);

            let itemHTML = `<div class="assessment-item">`;

            // Reading passage (if present)
            if (passage) {
              itemHTML += `
                <div class="passage-section">
                  <div class="passage-header">Reading Passage:</div>
                  <div class="passage-text">${escapeHtml(passage)}</div>
                </div>
              `;
            }

            // Question number and prompt
            itemHTML += `
              <div class="question-prompt">
                <span class="question-number">${itemIndex + 1}.</span>
                <span class="question-text">${escapeHtml(prompt)}</span>
              </div>
            `;

            // Answer area based on type
            if (type === 'multiple_choice' && options && options.length > 0) {
              itemHTML += '<div class="multiple-choice-options">';
              options.forEach((option, optIdx) => {
                itemHTML += `
                  <div class="option-row">
                    <span class="option-box"></span>
                    <span class="option-text">${escapeHtml(option)}</span>
                  </div>
                `;
              });
              itemHTML += '</div>';
            } else if (type === 'short_answer') {
              for (let i = 0; i < lineCount; i++) {
                itemHTML += '<div class="answer-line"></div>';
              }
            } else if (type === 'problem') {
              // Check if this is actually a number-writing task (should use lines, not work box)
              const numberSequencePatterns = [
                /write\s+(down\s+)?(the\s+)?numbers/i,
                /count\s+(from|to|forward|backwards?)/i,
                /list\s+the\s+numbers/i,
                /write\s+down\s+what\s+you\s+(count|say)/i,
                /start\s+at\s+\d+\s+and\s+count/i
              ];

              const isNumberSequence = numberSequencePatterns.some(pattern => pattern.test(prompt));

              if (isNumberSequence) {
                // Use answer lines for number sequences (not a work box)
                for (let i = 0; i < Math.min(lineCount, 8); i++) {
                  itemHTML += '<div class="answer-line"></div>';
                }
              } else {
                // Use work box for actual calculation problems
                itemHTML += `
                  <div class="work-space">
                    <div class="work-space-label">Work space:</div>
                    <div class="work-space-area"></div>
                  </div>
                `;
              }
            } else if (type === 'observation') {
              itemHTML += `
                <div class="observation-note">
                  <em>Teacher will observe and assess this skill.</em>
                </div>
              `;
            }

            itemHTML += '</div>'; // Close assessment-item
            return itemHTML;
          }).join('');

          return `
            <div class="goal-section">
              <h3 class="section-title">Section ${goalIndex + 1}</h3>
              <div class="assessment-items">
                ${itemsHTML}
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="worksheet-page">
            <!-- Header -->
            <div class="worksheet-header">
              <h1>Progress Check</h1>
              <div class="header-row">
                <div class="header-left">
                  <div class="student-info">Student: <strong>${escapeHtml(studentInitials)}</strong></div>
                  ${gradeLevel ? `<div class="grade-info">Grade: ${escapeHtml(gradeLevel)}</div>` : ''}
                </div>
                <div class="header-right">
                  <div class="date-line">Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                </div>
              </div>
            </div>

            <!-- Instructions -->
            <div class="instructions-box">
              <strong>Instructions:</strong> Complete all questions and problems below.
              Show your work where applicable. Read each question carefully before answering.
            </div>

            <!-- Assessment Content -->
            <div class="assessment-content">
              ${assessmentHTML}
            </div>
          </div>
        `;
      }).join('');

      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Progress Check Worksheets</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: Arial, sans-serif;
              font-size: 13pt;
              line-height: 1.6;
              color: #000;
              background: white;
            }

            .worksheet-page {
              width: 8.5in;
              min-height: 11in;
              padding: 0.5in;
              margin: 0 auto;
              background: white;
              page-break-after: always;
              page-break-inside: avoid;
              position: relative;
            }

            .worksheet-page:last-child {
              page-break-after: auto;
            }

            .worksheet-header {
              border-bottom: 3px solid #333;
              padding-bottom: 12px;
              margin-bottom: 12px;
            }

            .worksheet-header h1 {
              font-size: 22pt;
              margin-bottom: 10px;
            }

            .header-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }

            .student-info, .grade-info {
              font-size: 11pt;
              margin-top: 4px;
            }

            .date-line {
              font-size: 10pt;
              margin-top: 2px;
            }

            .instructions-box {
              background: #f5f5f5;
              border-left: 4px solid #666;
              padding: 12px;
              margin-bottom: 12px;
              font-size: 10pt;
            }

            .goal-section {
              margin-bottom: 16px;
            }

            .section-title {
              font-size: 14pt;
              font-weight: bold;
              margin-bottom: 12px;
            }

            .assessment-item {
              margin-bottom: 14px;
              page-break-inside: avoid;
            }

            .passage-section {
              background: #f8f9fa;
              border: 1px solid #dee2e6;
              border-left: 4px solid #0066cc;
              padding: 12px;
              margin-bottom: 12px;
              border-radius: 4px;
            }

            .passage-header {
              font-weight: bold;
              font-size: 10pt;
              margin-bottom: 6px;
            }

            .passage-text {
              font-size: 11pt;
              line-height: 1.7;
              white-space: pre-wrap;
            }

            .question-prompt {
              margin-bottom: 10px;
              display: flex;
              align-items: flex-start;
            }

            .question-number {
              font-weight: bold;
              margin-right: 8px;
              min-width: 24px;
            }

            .question-text {
              flex: 1;
              line-height: 1.5;
            }

            .multiple-choice-options {
              margin-left: 32px;
              margin-top: 8px;
            }

            .option-row {
              display: flex;
              align-items: center;
              margin: 6px 0;
            }

            .option-box {
              display: inline-block;
              width: 22px;
              height: 22px;
              border: 2px solid #333;
              margin-right: 10px;
              flex-shrink: 0;
            }

            .option-text {
              flex: 1;
            }

            .answer-line {
              border-bottom: 2px solid #666;
              height: 30px;
              margin: 8px 0 8px 32px;
            }

            .work-space {
              margin-left: 32px;
              margin-top: 10px;
            }

            .work-space-label {
              font-size: 9pt;
              color: #333;
              font-weight: 600;
              margin-bottom: 4px;
            }

            .work-space-area {
              border: 2px solid #666;
              min-height: 1.5in;
              background: white;
            }

            .observation-note {
              margin-left: 32px;
              margin-top: 8px;
              padding: 10px;
              background: #f5f5f5;
              border-left: 3px solid #666;
              font-size: 10pt;
              color: #555;
            }

            @media print {
              @page {
                margin: 0.5in;
                size: letter portrait;
              }

              body {
                margin: 0;
                padding: 0;
              }

              .worksheet-page {
                width: 100%;
                margin: 0;
                padding: 0;
              }

              .section-title {
                page-break-after: avoid;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          ${worksheetsHTML}
        </body>
        </html>
      `;
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

  // Helper function to determine number of lines for short answer questions
  // Students typically need 2-3 lines per sentence for handwriting
  const getLineCount = (item: AssessmentItem): number => {
    const { prompt } = item;

    // Check for single-letter/sound questions (phonics/phonemic awareness)
    const singleLetterPatterns = [
      /write\s+(down\s+)?the\s+(first|middle|last|beginning|ending)\s+sound/i,
      /what\s+(is\s+)?the\s+(first|middle|last|beginning|ending)\s+(sound|letter)/i,
      /write\s+the\s+(letter|sound)\s+(you\s+hear|that\s+makes)/i,
      /circle\s+the\s+(first|middle|last)\s+(sound|letter)/i
    ];

    const isSingleLetterQuestion = singleLetterPatterns.some(pattern => pattern.test(prompt));
    if (isSingleLetterQuestion) {
      // Single letter/sound only needs 2 lines max
      return 2;
    }

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

      // Students need ~2 lines per sentence on average, plus 1 extra for safety
      const lineCount = Math.ceil(avgCount * 2) + 1;
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
