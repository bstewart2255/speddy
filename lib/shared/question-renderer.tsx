/**
 * Shared Question Renderer
 *
 * Centralized React components for rendering questions across all content generation tools
 */

import React from 'react';
import {
  QuestionType,
  QUESTION_FORMATS,
  calculateLineCount,
  normalizeQuestionType,
  isNumberSequenceTask,
} from './question-types';
import { escapeHtml } from './print-styles';

/**
 * Regex pattern to remove letter prefixes from multiple choice options (e.g., "A.", "A)", "B.")
 */
const CHOICE_PREFIX_PATTERN = /^[A-D][\)\.]\s*/i;

/**
 * Question data structure
 */
export interface QuestionData {
  type: string;
  content: string;
  choices?: string[];
  blankLines?: number;
  answer?: string;
  passage?: string;
  solution?: string[];
}

/**
 * Props for QuestionRenderer
 */
export interface QuestionRendererProps {
  question: QuestionData;
  questionNumber?: number;
  showNumber?: boolean;
  className?: string;
}

/**
 * Main React component for rendering a single question
 */
export function QuestionRenderer({
  question,
  questionNumber,
  showNumber = true,
  className = '',
}: QuestionRendererProps) {
  const type = normalizeQuestionType(question.type);
  const format = QUESTION_FORMATS[type];

  // Don't render teacher-only content in student view
  if (!format.studentFacing) {
    return null;
  }

  const shouldShowNumber = showNumber && format.showNumber && questionNumber !== undefined;
  const lineCount = calculateLineCount(type, question.content, question.blankLines);

  return (
    <div className={`question-item ${format.cssClass} ${className}`}>
      {/* Question content with optional numbering */}
      <div className="question-prompt">
        {shouldShowNumber && (
          <span className="question-number font-bold mr-2">{questionNumber}.</span>
        )}
        <span className="question-text">{question.content}</span>
      </div>

      {/* Type-specific rendering */}
      {type === QuestionType.MULTIPLE_CHOICE && question.choices && (
        <MultipleChoiceOptions choices={question.choices} />
      )}

      {(type === QuestionType.SHORT_ANSWER || type === QuestionType.LONG_ANSWER) && (
        <AnswerLines count={lineCount} />
      )}

      {type === QuestionType.FILL_BLANK && <AnswerBlank />}

      {type === QuestionType.VISUAL_MATH && <MathWorkSpace compact />}

      {type === QuestionType.MATH_WORK && (
        <>
          {isNumberSequenceTask(question.content) ? (
            <AnswerLines count={Math.min(lineCount, 8)} />
          ) : (
            <MathWorkSpace />
          )}
        </>
      )}

      {type === QuestionType.OBSERVATION && <ObservationNote />}

      {type === QuestionType.PASSAGE && (
        <PassageDisplay content={question.content} />
      )}
    </div>
  );
}

/**
 * Multiple choice options component
 */
export function MultipleChoiceOptions({ choices }: { choices: string[] }) {
  return (
    <div className="ml-6 space-y-2 mt-3">
      {choices.map((choice, idx) => {
        // Remove any letter prefixes (A., A), etc.)
        const cleanChoice = choice.replace(CHOICE_PREFIX_PATTERN, '');

        return (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-6 h-6 border-2 border-gray-300 rounded flex-shrink-0" />
            <span className="text-gray-700">
              {String.fromCharCode(65 + idx)}. {cleanChoice}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Answer lines component
 */
export function AnswerLines({ count }: { count: number }) {
  return (
    <div className="ml-6 mt-2 space-y-2">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="border-b-2 border-gray-300 w-full h-8" />
      ))}
    </div>
  );
}

/**
 * Single answer blank (for fill-in-the-blank)
 */
export function AnswerBlank() {
  return <div className="ml-6 mt-2 border-b-2 border-gray-300 w-64 h-8" />;
}

/**
 * Math work space component - just empty space without label or box
 */
export function MathWorkSpace({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ml-6 mt-3 ${compact ? 'min-h-[80px]' : 'min-h-[120px]'}`} />
  );
}

/**
 * Observation note component
 */
export function ObservationNote() {
  return (
    <div className="ml-6 mt-2 p-3 bg-gray-50 border-l-2 border-gray-400 rounded">
      <p className="text-sm text-gray-600 italic">
        Teacher will observe and assess this skill.
      </p>
    </div>
  );
}

/**
 * Passage display component
 */
export function PassageDisplay({ content }: { content: string }) {
  return (
    <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
      <p className="text-sm font-medium text-blue-900 mb-2">Reading Passage:</p>
      <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

/**
 * HTML generation for print views
 */

/**
 * Generate HTML for a question (for print/PDF)
 */
export function generateQuestionHTML(
  question: QuestionData,
  questionNumber?: number,
  showNumber: boolean = true
): string {
  const type = normalizeQuestionType(question.type);
  const format = QUESTION_FORMATS[type];

  // Don't render teacher-only content
  if (!format.studentFacing) {
    return '';
  }

  const shouldShowNumber = showNumber && format.showNumber && questionNumber !== undefined;
  const lineCount = calculateLineCount(type, question.content, question.blankLines);

  let html = `<div class="question-item ${format.cssClass}">`;

  // Question prompt
  html += '<div class="question-prompt">';
  if (shouldShowNumber) {
    html += `<span class="question-number">${questionNumber}.</span> `;
  }
  html += `<span class="question-text">${escapeHtml(question.content)}</span>`;
  html += '</div>';

  // Type-specific HTML
  if (type === QuestionType.MULTIPLE_CHOICE && question.choices) {
    html += '<div class="multiple-choice-options">';
    question.choices.forEach((choice, idx) => {
      const cleanChoice = choice.replace(CHOICE_PREFIX_PATTERN, '');
      html += `
        <div class="option-row">
          <span class="option-box"></span>
          <span class="option-text">${String.fromCharCode(65 + idx)}. ${escapeHtml(cleanChoice)}</span>
        </div>
      `;
    });
    html += '</div>';
  } else if (
    type === QuestionType.SHORT_ANSWER ||
    type === QuestionType.LONG_ANSWER
  ) {
    for (let i = 0; i < lineCount; i++) {
      html += '<div class="answer-line"></div>';
    }
  } else if (type === QuestionType.FILL_BLANK) {
    html += '<div class="answer-blank"></div>';
  } else if (type === QuestionType.VISUAL_MATH) {
    html += '<div class="work-space compact"></div>';
  } else if (type === QuestionType.MATH_WORK) {
    if (isNumberSequenceTask(question.content)) {
      for (let i = 0; i < Math.min(lineCount, 8); i++) {
        html += '<div class="answer-line"></div>';
      }
    } else {
      html += '<div class="work-space"></div>';
    }
  } else if (type === QuestionType.OBSERVATION) {
    html += `
      <div class="observation-note">
        <em>Teacher will observe and assess this skill.</em>
      </div>
    `;
  } else if (type === QuestionType.PASSAGE) {
    html += `
      <div class="passage-section">
        <div class="passage-header">Reading Passage:</div>
        <div class="passage-text">${escapeHtml(question.content)}</div>
      </div>
    `;
  }

  html += '</div>';

  return html;
}
