/**
 * Print utilities for v2 template-based worksheets and lesson plans
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
import type { LessonPlan } from '@/lib/lessons/lesson-plan-generator';

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

/**
 * Generates HTML for a lesson plan in teacher-friendly format
 */
function generateLessonPlanHtml(lessonPlan: LessonPlan): string {
  const contentHtml = `
    <div class="lesson-plan-content" style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6;">
      <!-- Header -->
      <div style="border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="font-size: 24pt; font-weight: bold; color: #1e293b; margin: 0 0 8px 0;">${escapeHtml(lessonPlan.title)}</h1>
        <div style="color: #64748b; font-size: 11pt;">
          <span style="margin-right: 16px;"><strong>Grade:</strong> ${escapeHtml(lessonPlan.gradeLevel)}</span>
          <span style="margin-right: 16px;"><strong>Duration:</strong> ${lessonPlan.duration} minutes</span>
          <span><strong>Topic:</strong> ${escapeHtml(lessonPlan.topic)}</span>
        </div>
      </div>

      <!-- Learning Objectives -->
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16pt; font-weight: bold; color: #1e293b; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">Learning Objectives</h2>
        <ul style="margin: 0; padding-left: 24px;">
          ${lessonPlan.objectives.map(obj => `<li style="margin-bottom: 8px;">${escapeHtml(obj)}</li>`).join('')}
        </ul>
      </div>

      <!-- Teaching Steps -->
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16pt; font-weight: bold; color: #1e293b; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">Teaching Steps</h2>
        <ol style="margin: 0; padding-left: 24px;">
          ${lessonPlan.teachingSteps.map((step, i) => `
            <li style="margin-bottom: 16px;">
              <div style="display: flex; gap: 12px; align-items: flex-start;">
                <span style="flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; background-color: #dbeafe; color: #1e40af; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11pt;">
                  ${step.step}
                </span>
                <span style="flex: 1; padding-top: 4px;">${escapeHtml(step.instruction)}</span>
              </div>
            </li>
          `).join('')}
        </ol>
      </div>

      <!-- Guided Practice -->
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16pt; font-weight: bold; color: #1e293b; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">Guided Practice</h2>
        <ul style="margin: 0; padding-left: 24px;">
          ${lessonPlan.guidedPractice.map(practice => `<li style="margin-bottom: 8px;">${escapeHtml(practice)}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;

  return generatePrintDocument({
    title: `Lesson Plan: ${lessonPlan.title}`,
    content: contentHtml,
  });
}

/**
 * Prints a lesson plan using iframe method
 */
export function printLessonPlan(lessonPlan: LessonPlan): void {
  if (!lessonPlan) {
    console.error('No lesson plan provided to print');
    alert('Unable to print lesson plan. Please try generating again.');
    return;
  }

  const html = generateLessonPlanHtml(lessonPlan);

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
    console.error('Failed to prepare lesson plan for printing:', error);
    // Clean up iframe on error
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
    alert('Unable to prepare lesson plan for printing. Please try again.');
  }
}
