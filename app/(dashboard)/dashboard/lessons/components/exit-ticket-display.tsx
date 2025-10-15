'use client';

import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { QuestionRenderer, type QuestionData } from '@/lib/shared/question-renderer';
import {
  generatePrintDocument,
  escapeHtml,
} from '@/lib/shared/print-styles';
import { generateQuestionHTML } from '@/lib/shared/question-renderer';

interface ExitTicket {
  id: string;
  student_id: string;
  student_initials: string;
  student_grade: number;
  iep_goal_text: string;
  content: ExitTicketContent;
  created_at: string;
}

interface ExitTicketContent {
  passage?: string;
  problems?: ExitTicketProblem[];
  items?: ExitTicketProblem[];
}

interface ExitTicketProblem {
  type: string;
  question?: string;
  prompt?: string;
  problem?: string;
  text?: string;
  options?: string[];
  choices?: string[];
  answer?: string;
  answer_format?: {
    drawing_space?: boolean;
    lines?: number;
  };
}

interface ExitTicketDisplayProps {
  tickets: ExitTicket[];
  onBack: () => void;
}

export default function ExitTicketDisplay({ tickets, onBack }: ExitTicketDisplayProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handlePrint = () => {
    // Generate print HTML using shared utilities
    const generatePrintHTML = () => {
      const ticketsHTML = tickets.map((ticket) => {
        const problems = ticket.content.problems || ticket.content.items || [];

        // Convert exit ticket header to shared format
        const headerHTML = `
          <div class="worksheet-header">
            <div class="worksheet-title">Exit Ticket</div>
            <div class="student-info">
              <div class="info-field">Student: ${escapeHtml(ticket.student_initials)} (Grade ${ticket.student_grade})</div>
              <div class="info-field">Date: ${escapeHtml(formatDate(ticket.created_at))}</div>
            </div>
          </div>
        `;

        // Convert problems to QuestionData format and generate HTML
        const problemsHTML = problems.map((problem, pIndex: number) => {
          // Normalize problem to QuestionData format
          const questionData: QuestionData = {
            type: problem.type || 'short-answer',
            content: problem.question || problem.prompt || problem.problem || problem.text || String(problem),
            choices: problem.options || problem.choices,
            blankLines: problem.answer_format?.lines || (problem.type === 'short_answer' ? 2 : undefined),
          };

          return generateQuestionHTML(questionData, pIndex + 1, true);
        }).join('');

        // Add passage if present
        const passageHTML = ticket.content.passage ? `
          <div class="passage-section">
            <div class="passage-header">Read the following passage:</div>
            <div class="passage-text">${escapeHtml(ticket.content.passage)}</div>
          </div>
        ` : '';

        // Add footer
        const footerHTML = `
          <div class="worksheet-footer">
            Complete all problems. Show your work.
          </div>
        `;

        return `
          <div class="page-break-after">
            ${headerHTML}
            ${passageHTML}
            <div class="worksheet-section">
              ${problemsHTML}
            </div>
            ${footerHTML}
          </div>
        `;
      }).join('');

      // Use shared print document generator
      return generatePrintDocument({
        title: `Exit Tickets - ${formatDate(tickets[0]?.created_at || new Date().toISOString())}`,
        content: ticketsHTML,
      });
    };

    // Create iframe for isolated printing (shared pattern)
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

  // Convert problem to screen format
  const convertProblemToQuestionData = (problem: any): QuestionData => {
    if (typeof problem === 'string') {
      return {
        type: 'short-answer',
        content: problem,
        blankLines: 2,
      };
    }

    return {
      type: problem.type || 'short-answer',
      content: problem.question || problem.prompt || problem.problem || problem.text || 'Problem content not available',
      choices: problem.options || problem.choices,
      blankLines: problem.answer_format?.lines || (problem.type === 'short_answer' || problem.type === 'fill_in_blank' ? 2 : undefined),
    };
  };

  return (
    <div>
      {/* Screen View Controls */}
      <div className="no-print mb-6 flex justify-between items-center">
        <button
          onClick={onBack}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back to Builder
        </button>

        <button
          onClick={handlePrint}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <PrinterIcon className="mr-2 h-4 w-4" />
          Print All Tickets
        </button>
      </div>

      {/* Exit Tickets Display */}
      <div className="exit-tickets-container max-w-4xl mx-auto">
        {tickets.map((ticket) => {
          const problems = ticket.content.problems || ticket.content.items || [];

          return (
            <div key={ticket.id} className="bg-white border-2 border-gray-300 rounded-lg p-8 mb-6">
              {/* Header */}
              <div className="border-b-2 border-gray-300 pb-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Exit Ticket</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Student: {ticket.student_initials} (Grade {ticket.student_grade})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">
                      Date: {formatDate(ticket.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reading Passage (if present) */}
              {ticket.content.passage && (
                <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">Read the following passage:</h3>
                  <div className="text-gray-800 leading-relaxed whitespace-pre-line">
                    {ticket.content.passage}
                  </div>
                </div>
              )}

              {/* Problems using shared QuestionRenderer */}
              <div className="space-y-6">
                {problems.length > 0 ? (
                  problems.map((problem, index) => (
                    <QuestionRenderer
                      key={index}
                      question={convertProblemToQuestionData(problem)}
                      questionNumber={index + 1}
                      showNumber={true}
                    />
                  ))
                ) : (
                  <div className="text-gray-500">No problems generated</div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-8 pt-4 border-t-2 border-gray-200">
                <p className="text-xs text-gray-500 text-center italic">
                  Complete all problems. Show your work.
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
