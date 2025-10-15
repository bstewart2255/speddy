/**
 * Print utilities for v2 template-based worksheets
 * Generates HTML and prints using iframe to avoid printing entire page
 */

import { generateQuestionHTML, QuestionData } from '@/lib/shared/question-renderer';
import {
  generatePrintDocument,
  generateWorksheetHeader,
  generateSectionHeader,
  getSpacingClass,
  escapeHtml,
} from '@/lib/shared/print-styles';
import { stripQuestionNumber } from '@/lib/shared/question-types';

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
 * Generates HTML for a v2 worksheet using shared components
 */
function generateWorksheetHtml(worksheet: Worksheet): string {
  // Get spacing class from formatting rules
  const spacing = worksheet.formatting?.spacing || 'normal';
  const spacingClass = getSpacingClass(spacing as 'compact' | 'normal' | 'generous');

  // Generate header
  const headerHtml = generateWorksheetHeader({
    title: worksheet.title,
    subtitle: '',  // Removed duration display
    showStudentInfo: true,
  });

  // Generate sections
  const sectionsHtml = worksheet.sections
    .map((section) => {
      // Filter out teacher-only content (examples)
      const studentFacingItems = section.items.filter((item) => item.type !== 'example');

      // Check if section uses grid layout (for visual math)
      const useGridLayout = studentFacingItems.some((item) => item.type === 'visual-math');

      // Generate section header
      const sectionHeaderHtml = generateSectionHeader(section.title, section.instructions);

      // Generate questions HTML
      let questionsHtml = '';
      if (useGridLayout) {
        questionsHtml = `<div class="visual-math-grid">`;
        questionsHtml += studentFacingItems
          .map((item, idx) => {
            const cleanedItem = {
              ...item,
              content: stripQuestionNumber(item.content),
            };
            return generateQuestionHTML(cleanedItem as QuestionData, idx + 1, false);
          })
          .join('');
        questionsHtml += `</div>`;
      } else {
        questionsHtml = studentFacingItems
          .map((item, idx) => {
            // Render passages as plain text without the blue box
            if (item.type === 'passage') {
              return `
                <div class="passage-plain">
                  <p>${escapeHtml(item.content)}</p>
                </div>
              `;
            }

            // For other question types, strip numbering and use shared renderer
            const cleanedItem = {
              ...item,
              content: stripQuestionNumber(item.content),
            };
            return generateQuestionHTML(cleanedItem as QuestionData, idx + 1, true);
          })
          .join('');
      }

      return `
        <div class="worksheet-section ${spacingClass}">
          ${sectionHeaderHtml}
          ${questionsHtml}
        </div>
      `;
    })
    .join('');

  // Combine everything into complete document
  const contentHtml = headerHtml + sectionsHtml;

  return generatePrintDocument({
    title: worksheet.title,
    content: contentHtml,
  });
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
