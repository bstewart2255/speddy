/**
 * Shared Print Styles
 *
 * Centralized CSS for print/PDF generation across all content generation tools
 */

/**
 * Generate complete print stylesheet for worksheets
 */
export function generatePrintStyles(): string {
  return `
    <style>
      /* Reset and base styles */
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Arial', 'Helvetica', sans-serif;
        font-size: 12pt;
        line-height: 1.6;
        color: #000;
        background: white;
      }

      /* Page layout */
      @page {
        size: letter;
        margin: 0.75in;
      }

      @media print {
        body {
          margin: 0;
          padding: 0;
        }
      }

      /* Worksheet header */
      .worksheet-header {
        margin-bottom: 24pt;
        padding-bottom: 12pt;
        border-bottom: 2pt solid #000;
      }

      .worksheet-title {
        font-size: 18pt;
        font-weight: bold;
        margin-bottom: 8pt;
      }

      .worksheet-subtitle {
        font-size: 11pt;
        color: #333;
        margin-bottom: 4pt;
      }

      .student-info {
        display: flex;
        gap: 24pt;
        margin-top: 12pt;
        font-size: 11pt;
      }

      .info-field {
        flex: 1;
      }

      /* Section styling */
      .worksheet-section {
        margin-bottom: 24pt;
        page-break-inside: avoid;
      }

      .section-title {
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 8pt;
        padding-bottom: 4pt;
        border-bottom: 1.5pt solid #333;
      }

      .section-instructions {
        font-size: 10pt;
        font-style: italic;
        color: #444;
        margin-bottom: 12pt;
      }

      /* Question container */
      .question-item {
        margin-bottom: 20pt;
        page-break-inside: avoid;
      }

      .question-prompt {
        font-size: 11pt;
        margin-bottom: 8pt;
        font-weight: normal;
      }

      .question-number {
        font-weight: bold;
        margin-right: 6pt;
      }

      .question-text {
        display: inline;
      }

      /* Multiple choice */
      .question-multiple-choice .multiple-choice-options {
        margin-left: 18pt;
        margin-top: 8pt;
      }

      .option-row {
        display: flex;
        align-items: center;
        margin-bottom: 8pt;
      }

      .option-box {
        width: 14pt;
        height: 14pt;
        border: 1.5pt solid #333;
        border-radius: 2pt;
        margin-right: 8pt;
        flex-shrink: 0;
      }

      .option-text {
        font-size: 10pt;
        line-height: 1.4;
      }

      /* Answer lines */
      .answer-line {
        margin-left: 18pt;
        margin-bottom: 10pt;
        border-bottom: 1pt solid #333;
        height: 20pt;
      }

      /* Fill in the blank */
      .answer-blank {
        display: inline-block;
        margin-left: 18pt;
        margin-top: 6pt;
        border-bottom: 1pt solid #333;
        width: 180pt;
        height: 20pt;
      }

      /* Math work space */
      .work-space {
        margin-left: 18pt;
        margin-top: 10pt;
      }

      .work-space-label {
        font-size: 9pt;
        font-weight: bold;
        color: #555;
        margin-bottom: 4pt;
      }

      .work-space-area {
        border: 1.5pt solid #555;
        background-color: #f9f9f9;
        min-height: 100pt;
        padding: 6pt;
      }

      .work-space.compact .work-space-area {
        min-height: 60pt;
      }

      /* Observation notes */
      .observation-note {
        margin-left: 18pt;
        margin-top: 8pt;
        padding: 10pt;
        background-color: #f5f5f5;
        border-left: 3pt solid #999;
        border-radius: 3pt;
        font-size: 9pt;
        font-style: italic;
        color: #555;
      }

      /* Passage display */
      .passage-section {
        margin-bottom: 16pt;
        padding: 12pt;
        background-color: #f0f5ff;
        border-left: 4pt solid #4a7fbf;
        border-radius: 3pt;
        page-break-inside: avoid;
      }

      .passage-header {
        font-size: 10pt;
        font-weight: bold;
        color: #1e3a5f;
        margin-bottom: 8pt;
      }

      .passage-text {
        font-size: 11pt;
        line-height: 1.8;
        color: #1a1a1a;
        white-space: pre-wrap;
      }

      /* Plain passage (for dedicated passage sections) */
      .passage-plain {
        margin-bottom: 16pt;
        page-break-inside: avoid;
      }

      .passage-plain p {
        font-size: 11pt;
        line-height: 1.8;
        color: #1a1a1a;
        white-space: pre-wrap;
        margin: 0;
      }

      /* Spacing adjustments */
      .spacing-compact .question-item {
        margin-bottom: 14pt;
      }

      .spacing-compact .work-space-area {
        min-height: 70pt;
      }

      .spacing-generous .question-item {
        margin-bottom: 28pt;
      }

      .spacing-generous .work-space-area {
        min-height: 130pt;
      }

      .spacing-generous .answer-line {
        margin-bottom: 14pt;
        height: 24pt;
      }

      /* Grid layout for visual math */
      .question-visual-math.use-grid {
        display: inline-block;
        width: 48%;
        margin-right: 2%;
        vertical-align: top;
      }

      /* Page break helpers */
      .page-break-before {
        page-break-before: always;
      }

      .page-break-after {
        page-break-after: always;
      }

      .no-page-break {
        page-break-inside: avoid;
      }

      /* Print-specific adjustments */
      @media print {
        .no-print {
          display: none !important;
        }

        .question-item {
          orphans: 3;
          widows: 3;
        }

        .worksheet-section {
          orphans: 2;
          widows: 2;
        }

        /* Ensure work spaces are visible in print */
        .work-space-area {
          border: 1.5pt solid #555 !important;
          background-color: transparent !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Ensure passages are visible in print */
        .passage-section {
          background-color: #f0f5ff !important;
          border-left: 4pt solid #4a7fbf !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }

      /* True/False styling */
      .question-true-false .answer-options {
        margin-left: 18pt;
        margin-top: 8pt;
        display: flex;
        gap: 24pt;
      }

      .question-true-false .option-row {
        margin-bottom: 0;
      }

      /* Footer (optional) */
      .worksheet-footer {
        margin-top: 32pt;
        padding-top: 12pt;
        border-top: 1pt solid #ccc;
        font-size: 9pt;
        color: #666;
        text-align: center;
      }
    </style>
  `;
}

/**
 * Generate spacing class based on formatting rules
 */
export function getSpacingClass(spacing: 'compact' | 'normal' | 'generous'): string {
  if (spacing === 'compact') return 'spacing-compact';
  if (spacing === 'generous') return 'spacing-generous';
  return '';
}

/**
 * Generate worksheet header HTML
 */
export function generateWorksheetHeader(config: {
  title: string;
  subtitle?: string;
  showStudentInfo?: boolean;
  studentName?: string;
  date?: string;
}): string {
  const { title, subtitle, showStudentInfo = true, studentName, date } = config;

  let html = '<div class="worksheet-header">';
  html += `<div class="worksheet-title">${escapeHtml(title)}</div>`;

  if (subtitle) {
    html += `<div class="worksheet-subtitle">${escapeHtml(subtitle)}</div>`;
  }

  if (showStudentInfo) {
    html += '<div class="student-info">';
    html += `<div class="info-field">Name: ${studentName ? escapeHtml(studentName) : '_________________'}</div>`;
    html += `<div class="info-field">Date: ${date || '_________________'}</div>`;
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * Generate section header HTML
 */
export function generateSectionHeader(title: string, instructions?: string): string {
  let html = '<div class="section-header">';
  html += `<div class="section-title">${escapeHtml(title)}</div>`;

  if (instructions) {
    html += `<div class="section-instructions">${escapeHtml(instructions)}</div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Wrap content in complete HTML document for printing
 */
export function generatePrintDocument(config: {
  title: string;
  content: string;
  styles?: string;
}): string {
  const { title, content, styles = '' } = config;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)}</title>
      ${generatePrintStyles()}
      ${styles}
    </head>
    <body>
      ${content}
    </body>
    </html>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
