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
    // Create complete HTML document for printing
    const generatePrintHTML = () => {
      const ticketsHTML = tickets.map((ticket, index) => `
        <div class="exit-ticket-page">
          <div class="header">
            <div class="header-left">
              <h1>Exit Ticket</h1>
              <div class="student-info">
                Student: ${ticket.student_initials} (Grade ${ticket.student_grade})
              </div>
            </div>
            <div class="header-right">
              <div class="date">Date: ${formatDate(ticket.created_at)}</div>
            </div>
          </div>

          <div class="content">
            ${ticket.content.passage ? `
              <div class="passage-section">
                <div class="passage-header">Read the following passage:</div>
                <div class="passage-text">${ticket.content.passage}</div>
                <div class="passage-divider"></div>
              </div>
            ` : ''}
            ${ticket.content.problems ?
              ticket.content.problems.map((problem: any, pIndex: number) => {
                let problemHTML = `<div class="problem">
                  <div class="problem-number">${pIndex + 1}.</div>
                  <div class="problem-content">`;

                if (typeof problem === 'string') {
                  problemHTML += `<div class="problem-text">${problem}</div>`;
                } else if (problem.type === 'multiple_choice') {
                  problemHTML += `
                    <div class="problem-text">${problem.question || problem.prompt}</div>
                    ${problem.options ? `
                      <div class="options">
                        ${problem.options.map((option: string, i: number) => {
                          const cleanOption = option.replace(/^[A-D][\)\.]\s*/i, '');
                          return `
                            <div class="option">
                              <span class="option-letter">${String.fromCharCode(65 + i)}.</span>
                              <span>${cleanOption}</span>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    ` : ''}
                  `;
                } else if (problem.type === 'short_answer' || problem.type === 'fill_in_blank') {
                  problemHTML += `
                    <div class="problem-text">${problem.question || problem.prompt || problem.problem || problem.text}</div>
                    <div class="answer-line"></div>
                  `;
                } else if (problem.type === 'word_problem' || problem.type === 'problem') {
                  problemHTML += `
                    <div class="problem-text">${problem.question || problem.prompt || problem.problem}</div>
                    <div class="work-space">
                      <div class="answer-line"></div>
                      <div class="answer-line"></div>
                    </div>
                  `;
                } else {
                  problemHTML += `
                    <div class="problem-text">${problem.question || problem.prompt || problem.text || JSON.stringify(problem)}</div>
                    <div class="answer-line"></div>
                  `;
                }

                problemHTML += `</div></div>`;
                return problemHTML;
              }).join('')
              : ticket.content.items ?
                ticket.content.items.map((item: any, iIndex: number) => {
                  // Similar rendering logic for items
                  return `<div class="problem">
                    <div class="problem-number">${iIndex + 1}.</div>
                    <div class="problem-content">
                      <div class="problem-text">${item.question || item.prompt || item.text || JSON.stringify(item)}</div>
                      <div class="answer-line"></div>
                    </div>
                  </div>`;
                }).join('')
              : '<div>No problems generated</div>'
            }
          </div>

          <div class="footer">
            <div class="footer-line"></div>
            <div class="footer-text">Complete all problems. Show your work.</div>
          </div>
        </div>
      `).join('');

      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Exit Tickets - ${formatDate(tickets[0]?.created_at || new Date().toISOString())}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: Arial, sans-serif;
              font-size: 13pt;
              line-height: 1.5;
              color: #000;
              background: white;
            }

            .exit-ticket-page {
              width: 8.5in;
              height: 11in;
              padding: 0.5in;
              margin: 0 auto;
              background: white;
              page-break-after: always;
              page-break-inside: avoid;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              position: relative;
            }

            .exit-ticket-page:last-child {
              page-break-after: auto;
            }

            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              padding-bottom: 10px;
              margin-bottom: 20px;
              border-bottom: 3px solid #333;
            }

            .header h1 {
              font-size: 24pt;
              margin: 0 0 5px 0;
            }

            .student-info {
              font-size: 12pt;
              color: #333;
            }

            .date {
              font-size: 12pt;
              color: #333;
              text-align: right;
            }

            .content {
              flex: 1;
              padding: 10px 0;
            }

            .passage-section {
              margin-bottom: 25px;
              padding: 15px;
              background: #f8f9fa;
              border: 1px solid #dee2e6;
              border-radius: 4px;
            }

            .passage-header {
              font-weight: bold;
              margin-bottom: 10px;
              font-size: 12pt;
            }

            .passage-text {
              line-height: 1.8;
              font-size: 13pt;
              padding: 10px 0;
            }

            .passage-divider {
              border-bottom: 2px solid #dee2e6;
              margin-top: 15px;
            }

            .problem {
              display: flex;
              margin-bottom: 20px;
              page-break-inside: avoid;
            }

            .problem-number {
              font-weight: bold;
              margin-right: 10px;
              min-width: 25px;
            }

            .problem-content {
              flex: 1;
            }

            .problem-text {
              margin-bottom: 10px;
              line-height: 1.8;
            }

            .options {
              margin-left: 20px;
              margin-top: 10px;
            }

            .option {
              display: flex;
              margin: 8px 0;
            }

            .option-letter {
              font-weight: bold;
              margin-right: 10px;
              min-width: 25px;
            }

            .answer-line {
              border-bottom: 2px solid #666;
              height: 30px;
              margin: 8px 0;
            }

            .work-space .answer-line {
              margin: 10px 0;
            }

            .footer {
              margin-top: auto;
              padding-top: 20px;
            }

            .footer-line {
              border-top: 2px solid #ccc;
              margin-bottom: 10px;
            }

            .footer-text {
              text-align: center;
              font-size: 11pt;
              color: #666;
              font-style: italic;
            }

            @media print {
              body {
                margin: 0;
                padding: 0;
              }

              .exit-ticket-page {
                width: 100%;
                margin: 0;
                padding: 0.5in;
              }

              @page {
                margin: 0;
                size: letter;
              }
            }
          </style>
        </head>
        <body>
          ${ticketsHTML}
        </body>
        </html>
      `;
    };

    // Create iframe for isolated printing
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
              {problem.options.map((option: string, i: number) => {
                // Remove any existing letter prefix if it exists (e.g., "A) " or "A. ")
                const cleanOption = option.replace(/^[A-D][\)\.]\s*/i, '');
                return (
                  <div key={i} className="flex items-start">
                    <span className="mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span>{cleanOption}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (problem.type === 'short_answer' || problem.type === 'fill_in_blank') {
      return (
        <div className="mb-6">
          <div className="mb-2">{problem.question || problem.prompt || problem.problem || problem.text}</div>
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

            {/* Reading Passage (if present) */}
            {ticket.content.passage && (
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded">
                <h3 className="font-semibold text-sm mb-2">Read the following passage:</h3>
                <div className="text-gray-800 leading-relaxed">
                  {ticket.content.passage}
                </div>
                <div className="border-b-2 border-gray-300 mt-4"></div>
              </div>
            )}

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