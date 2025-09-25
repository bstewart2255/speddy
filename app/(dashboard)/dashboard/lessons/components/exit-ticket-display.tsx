'use client';

import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';

interface ExitTicket {
  id: string;
  student_id: string;
  student_initials: string;
  student_grade: number;
  iep_goal_text: string;
  content: any;
  created_at: string;
}

interface ExitTicketDisplayProps {
  tickets: ExitTicket[];
  onBack: () => void;
}

export default function ExitTicketDisplay({ tickets, onBack }: ExitTicketDisplayProps) {
  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const renderProblem = (problem: any, index: number) => {
    if (typeof problem === 'string') {
      return <div className="mb-4">{problem}</div>;
    }

    if (problem.type === 'multiple_choice') {
      return (
        <div className="mb-6">
          <div className="mb-2">{problem.question || problem.prompt}</div>
          {problem.options && (
            <div className="ml-4 space-y-1">
              {problem.options.map((option: string, i: number) => (
                <div key={i} className="flex items-start">
                  <span className="mr-2">{String.fromCharCode(65 + i)}.</span>
                  <span>{option}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (problem.type === 'short_answer' || problem.type === 'fill_in_blank') {
      return (
        <div className="mb-6">
          <div className="mb-2">{problem.question || problem.prompt}</div>
          <div className="border-b-2 border-gray-300 h-8"></div>
        </div>
      );
    }

    if (problem.type === 'word_problem' || problem.type === 'problem') {
      return (
        <div className="mb-6">
          <div className="mb-2">{problem.question || problem.prompt || problem.problem}</div>
          <div className="mt-4 space-y-2">
            <div className="border-b-2 border-gray-300 h-8"></div>
            <div className="border-b-2 border-gray-300 h-8"></div>
          </div>
        </div>
      );
    }

    // Default rendering for any unrecognized format
    return (
      <div className="mb-6">
        <div className="mb-2">
          {problem.question || problem.prompt || problem.text || JSON.stringify(problem)}
        </div>
        <div className="mt-4 border-b-2 border-gray-300 h-8"></div>
      </div>
    );
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
      <div className="exit-tickets-container">
        {tickets.map((ticket, ticketIndex) => (
          <div key={ticket.id} className="exit-ticket-page">
            {/* Header */}
            <div className="exit-ticket-header">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">Exit Ticket</h2>
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
              <div className="border-b-2 border-gray-400 mb-4"></div>
            </div>

            {/* Problems */}
            <div className="exit-ticket-content">
              {ticket.content.problems ? (
                ticket.content.problems.map((problem: any, index: number) => (
                  <div key={index} className="problem-item">
                    <div className="flex items-start">
                      <span className="font-semibold mr-2">{index + 1}.</span>
                      <div className="flex-1">
                        {renderProblem(problem, index)}
                      </div>
                    </div>
                  </div>
                ))
              ) : ticket.content.items ? (
                ticket.content.items.map((item: any, index: number) => (
                  <div key={index} className="problem-item">
                    <div className="flex items-start">
                      <span className="font-semibold mr-2">{index + 1}.</span>
                      <div className="flex-1">
                        {renderProblem(item, index)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div>No problems generated</div>
              )}
            </div>

            {/* Footer space for work */}
            <div className="exit-ticket-footer mt-8">
              <div className="border-t-2 border-gray-200 pt-4">
                <p className="text-xs text-gray-500 text-center">
                  Complete all problems. Show your work.
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          .no-print {
            display: none !important;
          }

          .exit-ticket-page {
            page-break-after: always;
            page-break-inside: avoid;
            width: 100%;
            min-height: 100vh;
            padding: 0.75in;
            margin: 0;
            box-sizing: border-box;
          }

          .exit-ticket-page:last-child {
            page-break-after: auto;
          }

          .exit-ticket-header {
            margin-bottom: 1rem;
          }

          .exit-ticket-content {
            min-height: 70vh;
          }

          .problem-item {
            margin-bottom: 1.5rem;
          }

          body {
            margin: 0;
            padding: 0;
          }
        }

        @media screen {
          .exit-ticket-page {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
          }

          .exit-tickets-container {
            max-width: 850px;
            margin: 0 auto;
          }
        }
      `}</style>
    </div>
  );
}