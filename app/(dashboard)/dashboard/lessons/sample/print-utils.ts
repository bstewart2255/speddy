/**
 * Print utilities for v2 template-based worksheets
 * Generates HTML and prints using iframe to avoid printing entire page
 */

interface WorksheetSection {
  title: string;
  instructions?: string;
  items: WorksheetItem[];
}

interface WorksheetItem {
  type: string;
  content: string;
  choices?: string[];
  blankLines?: number;
  solution?: string[];
}

interface Worksheet {
  title: string;
  grade: string;
  topic: string;
  duration: number;
  sections: WorksheetSection[];
  formatting?: {
    numberingStyle: string;
    spacing: string;
    showInstructions: boolean;
  };
}

/**
 * Generates HTML for a v2 worksheet
 */
function generateWorksheetHtml(worksheet: Worksheet): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${worksheet.title}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            padding: 40px;
            color: #1f2937;
          }

          .worksheet-header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #d1d5db;
          }

          .worksheet-header h1 {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 12px;
          }

          .worksheet-meta {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: #4b5563;
            margin-bottom: 8px;
          }

          .worksheet-topic {
            display: inline-block;
            padding: 4px 12px;
            background-color: #dbeafe;
            color: #1e40af;
            border-radius: 9999px;
            font-size: 12px;
            margin-top: 8px;
          }

          .worksheet-section {
            margin-bottom: 32px;
          }

          .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e5e7eb;
          }

          .section-instructions {
            font-size: 14px;
            font-style: italic;
            color: #374151;
            margin-bottom: 16px;
          }

          .section-items {
            margin-top: 16px;
          }

          .worksheet-item {
            margin-bottom: 16px;
            padding-left: 8px;
          }

          .item-passage {
            white-space: pre-wrap;
            line-height: 1.75;
            color: #1f2937;
          }

          .item-example {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 16px;
            border-radius: 4px;
          }

          .item-example-content {
            font-weight: 500;
            margin-bottom: 8px;
          }

          .item-example-solution {
            margin-top: 8px;
            font-size: 14px;
            color: #374151;
          }

          .item-example-solution p {
            margin: 4px 0;
          }

          .item-multiple-choice {
            margin-bottom: 8px;
          }

          .item-question {
            font-weight: 500;
            margin-bottom: 8px;
          }

          .item-choices {
            margin-left: 24px;
            margin-top: 8px;
          }

          .item-choice {
            display: flex;
            align-items: start;
            gap: 8px;
            margin: 4px 0;
          }

          .choice-label {
            color: #4b5563;
            font-weight: 500;
            min-width: 20px;
          }

          .item-answer-lines {
            margin-left: 24px;
            margin-top: 8px;
          }

          .answer-line {
            border-bottom: 1px solid #d1d5db;
            height: 32px;
          }

          .item-fill-blank-line {
            margin-left: 24px;
            margin-top: 8px;
            border-bottom: 1px solid #d1d5db;
            width: 256px;
            height: 32px;
          }

          .item-text {
            color: #1f2937;
          }

          .worksheet-footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            font-size: 12px;
            color: #6b7280;
          }

          @media print {
            body {
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="worksheet-header">
          <h1>${worksheet.title}</h1>
          <div class="worksheet-meta">
            <span>Grade: ${worksheet.grade}</span>
            <span>Duration: ${worksheet.duration} minutes</span>
          </div>
          <div>
            <span class="worksheet-topic">${worksheet.topic}</span>
          </div>
        </div>

        <!-- Sections -->
        ${worksheet.sections.map(section => `
          <div class="worksheet-section">
            <h2 class="section-title">${section.title}</h2>

            ${section.instructions ? `
              <p class="section-instructions">${section.instructions}</p>
            ` : ''}

            <div class="section-items">
              ${section.items.map(item => {
                if (item.type === 'passage') {
                  return `
                    <div class="worksheet-item">
                      <p class="item-passage">${item.content}</p>
                    </div>
                  `;
                }

                if (item.type === 'example') {
                  return `
                    <div class="worksheet-item">
                      <div class="item-example">
                        <p class="item-example-content">${item.content}</p>
                        ${item.solution && item.solution.length > 0 ? `
                          <div class="item-example-solution">
                            ${item.solution.map(step => `<p>• ${step}</p>`).join('')}
                          </div>
                        ` : ''}
                      </div>
                    </div>
                  `;
                }

                if (item.type === 'multiple-choice') {
                  return `
                    <div class="worksheet-item item-multiple-choice">
                      <p class="item-question">${item.content}</p>
                      ${item.choices ? `
                        <div class="item-choices">
                          ${item.choices.map((choice, idx) => `
                            <div class="item-choice">
                              <span class="choice-label">${String.fromCharCode(65 + idx)}.</span>
                              <span>${choice}</span>
                            </div>
                          `).join('')}
                        </div>
                      ` : ''}
                    </div>
                  `;
                }

                if (item.type === 'short-answer' || item.type === 'long-answer') {
                  const lines = item.blankLines || 3;
                  return `
                    <div class="worksheet-item">
                      <p class="item-question">${item.content}</p>
                      <div class="item-answer-lines">
                        ${Array.from({ length: lines }).map(() => `
                          <div class="answer-line"></div>
                        `).join('')}
                      </div>
                    </div>
                  `;
                }

                if (item.type === 'fill-blank') {
                  return `
                    <div class="worksheet-item">
                      <p class="item-question">${item.content}</p>
                      <div class="item-fill-blank-line"></div>
                    </div>
                  `;
                }

                if (item.type === 'text') {
                  return `
                    <div class="worksheet-item">
                      <p class="item-text">${item.content}</p>
                    </div>
                  `;
                }

                return '';
              }).join('')}
            </div>
          </div>
        `).join('')}

        <!-- Footer -->
        <div class="worksheet-footer">
          Generated with Template-Based System (v2)
        </div>
      </body>
    </html>
  `;
}

/**
 * Prints a v2 worksheet using iframe method (avoids printing entire page)
 */
export function printV2Worksheet(worksheet: Worksheet): void {
  if (!worksheet) {
    console.error('No worksheet provided to print');
    alert('Unable to print worksheet. Please try generating again.');
    return;
  }

  const html = generateWorksheetHtml(worksheet);

  // Create a hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';

  // Add iframe to document
  document.body.appendChild(iframe);

  try {
    // Write content to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Unable to access iframe document');
    }

    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for content to load then print
    const printAndCleanup = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (printError) {
        console.error('Failed to trigger print dialog:', printError);
      } finally {
        // Remove iframe after a delay to ensure print dialog has opened
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      }
    };

    // Check if content is loaded
    if (iframe.contentWindow?.document.readyState === 'complete') {
      printAndCleanup();
    } else {
      iframe.onload = printAndCleanup;
      // Fallback timeout
      setTimeout(printAndCleanup, 1500);
    }
  } catch (error) {
    console.error('Failed to prepare worksheet for printing:', error);
    // Clean up iframe on error
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
    alert('Unable to prepare worksheet for printing. Please try again.');
  }
}
