// Worksheet renderer - converts JSON to HTML with XSS protection
import { LessonResponse, StudentMaterial } from './schema';

export class WorksheetRenderer {
  /**
   * Escapes HTML to prevent XSS attacks
   */
  private escapeHtml(str: string | undefined | null): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Renders a complete lesson to HTML (teacher view)
   */
  renderLessonPlan(lesson: LessonResponse): string {
    const { lesson: plan } = lesson;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(plan.title)}</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      max-width: 800px; 
      margin: 0 auto; 
      padding: 20px;
    }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    h3 { color: #666; }
    .section { 
      margin: 20px 0; 
      padding: 15px; 
      background: #f9f9f9; 
      border-radius: 5px;
    }
    .materials { 
      background: #fff3cd; 
      padding: 10px; 
      border-left: 4px solid #ffc107;
      margin: 10px 0;
    }
    .objectives li { margin: 5px 0; }
    .activity { 
      margin: 15px 0; 
      padding: 10px; 
      border: 1px solid #ddd;
      background: white;
    }
    .time { 
      display: inline-block; 
      background: #007bff; 
      color: white; 
      padding: 2px 8px; 
      border-radius: 3px;
      font-size: 0.9em;
    }
    .role-specific {
      background: #e8f4ff;
      padding: 10px;
      border-left: 4px solid #007bff;
      margin: 10px 0;
    }
    .teacher-plan {
      background: #e7f3ff;
      padding: 15px;
      border: 2px solid #007bff;
      border-radius: 8px;
      margin: 20px 0;
    }
    .student-initials {
      display: inline-block;
      background: #fff;
      padding: 5px 10px;
      border: 1px solid #007bff;
      border-radius: 4px;
      margin: 2px;
    }
    .teacher-script {
      background: #fffacd;
      padding: 12px;
      border-left: 4px solid #ffc107;
      font-style: italic;
      margin: 15px 0;
    }
    .whiteboard-example {
      background: white;
      border: 2px solid #28a745;
      padding: 15px;
      margin: 15px 0;
      border-radius: 5px;
    }
    .example-steps {
      margin-left: 20px;
      padding-left: 10px;
      border-left: 3px solid #28a745;
    }
    .teaching-point {
      background: #d4edda;
      padding: 8px;
      border-radius: 4px;
      margin-top: 10px;
      font-weight: bold;
    }
    .student-problems {
      background: #f8f9fa;
      padding: 10px;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      margin: 10px 0;
    }
    .problem-answer {
      color: #28a745;
      font-weight: bold;
      margin-left: 10px;
    }
    @media print {
      body {
        max-width: 100%;
        margin: 0;
        padding: 15px;
      }
      h1, h2, h3, h4, h5 {
        page-break-after: avoid;
        page-break-inside: avoid;
      }
      .section {
        page-break-inside: avoid;
        margin: 15px 0;
      }
      .teacher-plan {
        page-break-inside: avoid;
      }
      .whiteboard-example {
        page-break-inside: avoid;
      }
      .student-problems {
        page-break-inside: avoid;
      }
      .activity {
        page-break-inside: avoid;
      }
      .materials {
        page-break-inside: avoid;
      }
      /* Keep teaching sections together */
      .teacher-script {
        page-break-inside: avoid;
      }
      .teaching-point {
        page-break-inside: avoid;
      }
      /* Reduce excessive margins that cause blank pages */
      h2 { margin-top: 20px; }
      .section { padding: 10px; }
      /* Hide UI elements */
      .no-print { display: none !important; }
      button { display: none !important; }
      .print-icon { display: none !important; }
      nav { display: none !important; }
      .toolbar { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(plan.title)}</h1>
  
  ${this.renderTeacherLessonPlan(plan, lesson)}
  
  ${!plan.teacherLessonPlan ? `
  <div class="section">
    <h2>Lesson Overview</h2>
    <p><strong>Duration:</strong> ${this.escapeHtml(String(plan.duration))} minutes</p>
    <div class="materials">
      <strong>Materials:</strong> ${this.escapeHtml(plan.materials)}
    </div>
    <p>${this.escapeHtml(plan.overview)}</p>
  </div>

  <div class="section">
    <h2>Learning Objectives</h2>
    <ul class="objectives">
      ${plan.objectives.map(obj => `<li>${this.escapeHtml(obj)}</li>`).join('')}
    </ul>
  </div>

  <div class="section">
    <h2>Introduction</h2>
    <span class="time">${this.escapeHtml(String(plan.introduction.duration))} minutes</span>
    <div class="activity">
      <p>${this.escapeHtml(plan.introduction.description)}</p>
      <h4>Instructions:</h4>
      <ol>
        ${plan.introduction.instructions.map(inst => `<li>${this.escapeHtml(inst)}</li>`).join('')}
      </ol>
    </div>
  </div>

  <div class="section">
    <h2>Activity</h2>
    <span class="time">${this.escapeHtml(String(plan.activity.duration))} minutes</span>
    <div class="activity">
      <p>${this.escapeHtml(plan.activity.description)}</p>
      <h4>Instructions:</h4>
      <ol>
        ${plan.activity.instructions.map(inst => `<li>${this.escapeHtml(inst)}</li>`).join('')}
      </ol>
    </div>
  </div>
  ` : ''}

  ${this.renderGradeGroups(lesson)}
  ${this.renderDifferentiationStrategies(lesson)}

</body>
</html>`;
  }

  /**
   * Renders a student worksheet to HTML
   */
  renderStudentWorksheet(
    material: StudentMaterial, 
    studentName?: string,
    qrCodeUrl?: string
  ): string {
    const worksheet = material.worksheet;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(worksheet.title)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 14pt;
      line-height: 1.8;
      max-width: 700px;
      margin: 0 auto;
      padding: 5px;
    }
    h1 {
      color: #333;
      font-size: 2em;
      font-weight: bold;
      text-align: center;
      margin-bottom: 20px;
      padding: 10px 0;
      border-bottom: 2px solid #007bff;
    }
    .header {
      border: 2px solid #333;
      padding: 10px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .student-info {
      font-size: 1.1em;
    }
    .qr-code {
      width: 80px;
      height: 80px;
    }
    .instructions {
      background: #f0f0f0;
      padding: 8px;
      margin: 5px 0;
      border-left: 3px solid #007bff;
      font-size: 1em;
    }
    .section {
      margin: 10px 0;
      /* Allow sections to break across pages naturally */
    }
    .section h2 {
      font-size: 1.2em;
      color: #555;
      margin-bottom: 10px;
    }
    .item {
      margin: 8px 0;
      padding: 5px;
      border: 1px solid #ddd;
      background: white;
    }
    .question {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .choices {
      margin: 10px 0;
      padding-left: 20px;
    }
    .choices li {
      margin: 5px 0;
      list-style-type: upper-alpha;
    }
    .answer-space {
      border-bottom: 1px solid #666;
      min-height: 30px;
      margin: 10px 0;
    }
    .answer-lines {
      border-bottom: 1px solid #999;
      min-height: 28px;
      margin: 6px 0;
      width: 100%;
    }
    .passage {
      margin-bottom: 10px;
      padding: 10px;
      background: #f8f9fa;
      border-left: 4px solid #007bff;
      font-size: 1em;
      line-height: 1.8;
    }
    .example {
      margin-bottom: 8px;
      padding: 8px;
      background: #fff9e6;
      border-left: 4px solid #ffc107;
      font-style: italic;
    }
    .accommodations {
      background: #ffffcc;
      padding: 8px;
      margin: 10px 0;
      border: 1px dashed #ff9900;
      font-size: 0.9em;
    }
    @media print {
      body {
        max-width: 100%;
        margin: 0;
        padding: 5px;
      }
      .header {
        page-break-inside: avoid;
        margin-bottom: 5px;
      }
      h1 {
        margin: 5px 0 10px 0;
        font-size: 1.6em;
        font-weight: bold;
        /* Remove page-break-after to allow content to flow */
      }
      h2 {
        margin: 10px 0 5px 0;
        font-size: 1.1em;
        page-break-after: avoid;
      }
      h3 {
        page-break-after: avoid;
      }
      .section {
        /* Allow sections to break naturally if needed */
        margin: 5px 0;
      }
      .item {
        /* Keep individual questions together but allow page breaks between them */
        page-break-inside: avoid;
        margin: 5px 0;
        padding: 3px;
      }
      .instructions {
        margin: 5px 0;
      }
      .accommodations {
        page-break-inside: avoid;
        margin: 8px 0;
      }
      /* Keep questions with their answer spaces */
      .question {
        page-break-after: avoid;
        margin-bottom: 5px;
      }
      .answer-lines {
        page-break-inside: avoid;
        margin: 4px 0;
      }
      /* Reduce excessive white space */
      .passage {
        margin: 5px 0;
      }
      .example {
        margin: 5px 0;
      }
      /* Hide UI elements */
      .no-print { display: none !important; }
      button { display: none !important; }
      .print-icon { display: none !important; }
      nav { display: none !important; }
      .toolbar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="student-info">
      <strong>Name:</strong> ${this.escapeHtml(studentName) || '____________________'}<br>
      <strong>Date:</strong> ____________________<br>
      <strong>Grade:</strong> ${this.escapeHtml(String(material.worksheet?.grade || material.gradeLevel || ''))}
    </div>
    ${/* QR CODE DISABLED: QR codes temporarily disabled to simplify pipeline (Issue #268)
    qrCodeUrl ? `<img src="${this.escapeHtml(qrCodeUrl)}" alt="QR Code" class="qr-code">` : '' */ ''}
  </div>

  <h1>${this.escapeHtml(worksheet.title)}</h1>

  <div class="instructions">
    <strong>Instructions:</strong> ${this.escapeHtml(worksheet.instructions)}
  </div>

  ${material.accommodations && material.accommodations.length > 0 ? `
    <div class="accommodations">
      <strong>Your Accommodations:</strong>
      <ul>
        ${material.accommodations.map(acc => `<li>${this.escapeHtml(acc)}</li>`).join('')}
      </ul>
    </div>
  ` : ''}

  ${(() => {
    // Track overall question number across ALL sections for consistent numbering
    let questionNumber = 1;

    return (worksheet.sections || []).map((section, sectionIndex) => {
      // Check if this is a reading passage section
      const isReadingSection = section.title?.toLowerCase().includes('reading') ||
                              section.title?.toLowerCase().includes('passage') ||
                              section.title?.toLowerCase().includes('story');

      return `
      <div class="section">
        <h2>${this.escapeHtml(section.title)}</h2>
        ${section.instructions ? `<p class="section-instructions"><em>${this.escapeHtml(section.instructions)}</em></p>` : ''}

        ${(section.items ?? [])
          .filter((item: any) => {
            // Filter out 'example' type items from student worksheets
            // Examples should only appear in teacher lesson plan
            if (item.type === 'example') return false;
            return true;
          })
          .map((worksheetContent: any, contentIndex: number) => {
          // If items is an array of WorksheetContent objects with nested items
          if (worksheetContent.items && Array.isArray(worksheetContent.items)) {
            // Flatten the structure - render the nested items directly with simple numbering
            const result = this.renderWorksheetContentSection(worksheetContent, 0, questionNumber);
            // Update questionNumber based on how many questions were in the section
            // Note: renderWorksheetContentSection doesn't update questionNumber, so we need to count manually
            const itemCount = worksheetContent.items.filter(item =>
              item.type !== 'passage' && item.type !== 'text' && item.type !== 'example'
            ).length;
            questionNumber += itemCount;
            return result;
          }
          // Otherwise it's a direct item
          const shouldNumber = !isReadingSection &&
                             worksheetContent.type !== 'passage' &&
                             worksheetContent.type !== 'text';
          const result = this.renderWorksheetItem(worksheetContent, 0, questionNumber, shouldNumber);
          if (shouldNumber) questionNumber++;
          return result;
        }).join('')}
      </div>
    `;
    }).join('');
  })()}

</body>
</html>`;
  }

  private renderWorksheetContentSection(worksheetContent: any, sectionIndex: number, contentIndex: number): string {
    // Simplify the nested structure handling
    // If it's a nested structure (sections > items > items), flatten it completely
    if (worksheetContent.sectionType && worksheetContent.items) {
      // This is already a content section with items, render them directly with simple sequential numbering
      let itemNumber = 1;
      return worksheetContent.items
        .filter((item: any) => item.type !== 'example') // Filter out examples from student worksheets
        .map((item: any) => {
        // For story/passage items, don't number them
        if (item.type === 'passage' || item.type === 'text') {
          return this.renderWorksheetItem(item, 0, 0, false);
        }
        // Use simple sequential numbering for all practice questions
        return this.renderWorksheetItem(item, 0, itemNumber++, true);
      }).join('');
    }

    // Direct item (not nested)
    if (!worksheetContent.items || !Array.isArray(worksheetContent.items)) {
      return this.renderWorksheetItem(worksheetContent, 0, contentIndex, true);
    }

    // Check if the content has actual questions/items
    const hasContent = worksheetContent.items.length > 0 &&
                      worksheetContent.items.some((item: any) => item.content && item.content.trim() !== '');

    if (!hasContent) {
      console.warn('Section has no content items:', worksheetContent.sectionTitle || 'unnamed');
    }

    // Simple sequential numbering for all items
    let itemNumber = 1;
    return worksheetContent.items
      .filter((item: any) => item.type !== 'example') // Filter out examples from student worksheets
      .map((item: any) => {
      // For story/passage items, don't number them
      if (item.type === 'passage' || item.type === 'text') {
        return this.renderWorksheetItem(item, 0, 0, false);
      }
      return this.renderWorksheetItem(item, 0, itemNumber++, true);
    }).join('');
  }
  
  private renderWorksheetItem(item: any, sectionIndex: number, itemIndex: number, showNumber: boolean = true): string {
    // Render passages or text-only content without answer lines
    if (item.type === 'passage' || item.type === 'text' || item.type === 'visual') {
      return `
      <div class="item">
        <div class="passage" style="margin-bottom: 15px; padding: 10px; background: #f0f8ff; border-left: 3px solid #4a90e2;">
          ${this.escapeHtml(item.content).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')}
        </div>
      </div>`;
    }

    // Render examples without numbering
    if (item.type === 'example') {
      // Check if content already starts with "Example" to avoid duplication
      const content = item.content || '';
      const trimmedContent = content.trim();
      const startsWithExample = trimmedContent.toLowerCase().startsWith('example');

      return `
      <div class="item">
        <div class="example" style="margin-bottom: 10px; padding: 8px; background: #fffacd; border-left: 3px solid #ffd700;">
          ${startsWithExample ?
            this.escapeHtml(trimmedContent) :
            `<strong>Example:</strong> ${this.escapeHtml(trimmedContent)}`
          }
        </div>
      </div>`;
    }

    // Generate appropriate number of answer lines based on blankLines property
    const generateAnswerLines = (lines: number = 1) => {
      let html = '';
      for (let i = 0; i < lines; i++) {
        html += '<div class="answer-lines"></div>\n';
      }
      return html;
    };

    // Clean the content to remove any existing numbering/lettering at the start
    let cleanContent = item.content || '';
    // Remove patterns like "1. ", "1) ", "(1) ", "A. ", "A) ", etc. from the beginning
    cleanContent = String(cleanContent)
      .replace(/^\s*\d+\.\s+/, '')    // Remove "1. " pattern
      .replace(/^\s*\d+\)\s*/, '')    // Remove "1)" pattern
      .replace(/^\s*\(\d+\)\s*/, '')  // Remove "(1)" pattern
      .replace(/^\s*[A-H]\.\s+/i, '') // Remove "A. " pattern
      .replace(/^\s*[A-H]\)\s*/i, '')  // Remove "A)" pattern
      .replace(/^\s*\([A-H]\)\s*/i, ''); // Remove "(A)" pattern

    // Simple sequential numbering
    const questionNumber = showNumber ? `${itemIndex}. ` : '';

    return `
    <div class="item">
      <div class="question">${questionNumber}${this.escapeHtml(cleanContent)}</div>
      ${item.type === 'multiple-choice' && item.choices ? `
        <ul class="choices">
          ${item.choices.map((choice: string, idx: number) => {
            // Strip any letter prefixes (e.g., "A.", "A)", "A:") to avoid duplication with CSS upper-alpha styling
            const cleanChoice = String(choice).replace(/^\\s*[A-H]\\s*[\\.\\)\\:]\\s*/i, '');
            return `<li>${this.escapeHtml(cleanChoice)}</li>`;
          }).join('')}
        </ul>
      ` : item.type === 'fill-blank' || item.type === 'fill-in-blank' ? 
        generateAnswerLines(item.blankLines || 1) 
      : item.type === 'short-answer' ? 
        generateAnswerLines(item.blankLines || 2)
      : item.type === 'long-answer' ? 
        generateAnswerLines(item.blankLines || 4)
      : item.type === 'visual-math' ? 
        generateAnswerLines(item.blankLines || 3)
      : 
        generateAnswerLines(item.blankLines || 2)
      }
    </div>`;
  }

  private renderRoleSpecificContent(content: any): string {
    if (!content) return '';
    
    const items: string[] = [];
    
    if (content.differentiationStrategies) {
      items.push(`
        <h3>Differentiation Strategies</h3>
        <ul>${content.differentiationStrategies.map((s: string) => `<li>${this.escapeHtml(s)}</li>`).join('')}</ul>
      `);
    }
    
    if (content.scaffoldingSteps) {
      items.push(`
        <h3>Scaffolding Steps</h3>
        <ol>${content.scaffoldingSteps.map((s: string) => `<li>${this.escapeHtml(s)}</li>`).join('')}</ol>
      `);
    }
    
    if (content.fineMotorActivities) {
      items.push(`
        <h3>Fine Motor Activities</h3>
        <ul>${content.fineMotorActivities.map((s: string) => `<li>${this.escapeHtml(s)}</li>`).join('')}</ul>
      `);
    }
    
    if (content.sensorySupports) {
      items.push(`
        <h3>Sensory Supports</h3>
        <ul>${content.sensorySupports.map((s: string) => `<li>${this.escapeHtml(s)}</li>`).join('')}</ul>
      `);
    }
    
    if (content.articulationTargets) {
      items.push(`
        <h3>Articulation Targets</h3>
        <ul>${content.articulationTargets.map((s: string) => `<li>${this.escapeHtml(s)}</li>`).join('')}</ul>
      `);
    }
    
    if (content.languageGoals) {
      items.push(`
        <h3>Language Goals</h3>
        <ul>${content.languageGoals.map((s: string) => `<li>${this.escapeHtml(s)}</li>`).join('')}</ul>
      `);
    }
    
    if (items.length === 0) return '';
    
    return `
      <div class="section role-specific">
        <h2>Specialized Content</h2>
        ${items.join('')}
      </div>
    `;
  }


  /**
   * Renders answer key for teacher
   */
  renderAnswerKey(lesson: LessonResponse): string {
    const answerKey = lesson.lesson.answerKey;
    
    if (!answerKey || (!answerKey.answers && !answerKey.items)) {
      return '<p>No answer key available</p>';
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Answer Key - ${this.escapeHtml(lesson.lesson.title)}</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      max-width: 700px; 
      margin: 0 auto; 
      padding: 20px;
    }
    h1 { 
      color: #333; 
      border-bottom: 2px solid #dc3545;
      padding-bottom: 10px;
    }
    .answer {
      margin: 15px 0;
      padding: 10px;
      background: #f8f9fa;
      border-left: 3px solid #28a745;
    }
    .question-number {
      font-weight: bold;
      color: #007bff;
    }
    .correct-answer {
      color: #28a745;
      font-weight: bold;
    }
    .rubric {
      background: #fff3cd;
      padding: 10px;
      margin: 10px 0;
      border: 1px solid #ffc107;
    }
    @media print {
      body { max-width: 100%; }
    }
  </style>
</head>
<body>
  <h1>Answer Key</h1>
  <h2>${this.escapeHtml(lesson.lesson.title)}</h2>
  
  ${answerKey.answers ? Object.entries(answerKey.answers).map(([key, answer]) => `
    <div class="answer">
      <span class="question-number">Question ${this.escapeHtml(key)}:</span>
      <span class="correct-answer">${this.escapeHtml(String(answer))}</span>
    </div>
  `).join('') : ''}

  ${answerKey.rubric ? `
    <div class="rubric">
      <h3>Grading Rubric</h3>
      <p>${this.escapeHtml(answerKey.rubric)}</p>
    </div>
  ` : ''}

  ${answerKey.notes ? `
    <div class="notes">
      <h3>Teacher Notes</h3>
      <p>${this.escapeHtml(answerKey.notes)}</p>
    </div>
  ` : ''}

</body>
</html>`;
  }

  private renderTeacherLessonPlan(plan: any, fullLesson?: LessonResponse): string {
    if (!plan.teacherLessonPlan) return '';

    const tlp = plan.teacherLessonPlan;
    
    return `
    <div class="teacher-plan">
      <h2>📋 Teacher Lesson Plan</h2>
      
      <div style="margin: 10px 0;">
        <strong>Students:</strong>
        ${tlp.studentInitials?.map((initial: string) => 
          `<span class="student-initials">${this.escapeHtml(initial)}</span>`
        ).join('') || ''}
      </div>
      
      <div style="margin: 10px 0;">
        <h3>📚 Lesson Topic: ${this.escapeHtml(tlp.topic || '')}</h3>
      </div>
      
      <div class="teacher-script">
        <h3>🎯 Teacher Introduction</h3>
        <p>${this.escapeHtml(tlp.teacherIntroduction?.script || '')}</p>
      </div>
      
      <div style="margin: 20px 0;">
        <h3>✏️ Whiteboard Examples</h3>
        ${tlp.whiteboardExamples?.map((example: any, index: number) => `
          <div class="whiteboard-example">
            <h4>Example ${example.number || index + 1}: ${this.escapeHtml(example.title || '')}</h4>
            <p><strong>Problem:</strong> ${this.escapeHtml(example.problem || '')}</p>
            <div class="example-steps">
              <strong>Solution Steps:</strong>
              <ol>
                ${example.steps?.map((step: string) => {
                  // Remove various numbering prefixes to avoid redundancy with <ol>
                  // Handles: "Step N:", "N.", "N)", "(N)", just "N" at the start
                  const cleanStep = step
                    .replace(/^Step\s+\d+:\s*/i, '')
                    .replace(/^\d+\.\s*/, '')
                    .replace(/^\d+\)\s*/, '')
                    .replace(/^\(\d+\)\s*/, '')
                    .replace(/^\d+\s+/, '');
                  return `<li>${this.escapeHtml(cleanStep)}</li>`;
                }).join('') || ''}
              </ol>
            </div>
            <div class="teaching-point">
              💡 <strong>Teaching Point:</strong> ${this.escapeHtml(example.teachingPoint || '')}
            </div>
          </div>
        `).join('') || ''}
      </div>
      
      <div style="margin: 20px 0;">
        <h3>📝 Student Worksheet Problems</h3>
        ${(() => {
          // If we have the full lesson with studentMaterials, show all problems
          if (fullLesson && fullLesson.studentMaterials && fullLesson.studentMaterials.length > 0) {
            return fullLesson.studentMaterials.map((material: any) => {
              // Find the index of current material to match with studentInitials array
              const materialIndex = fullLesson.studentMaterials.findIndex(mat => mat === material);
              const studentInitials = materialIndex >= 0 && materialIndex < (tlp.studentInitials?.length || 0)
                ? tlp.studentInitials[materialIndex]
                : 'Student';

              return `
                <div class="student-problems">
                  <h4>Student: ${this.escapeHtml(studentInitials)}</h4>
                  ${material.worksheet?.sections?.map((section: any) => `
                    <div style="margin: 15px 0;">
                      <h5 style="color: #007bff;">${this.escapeHtml(section.title || 'Section')}</h5>
                      ${section.instructions ? `<p style="font-style: italic; color: #666;">${this.escapeHtml(section.instructions)}</p>` : ''}
                      <ol>
                        ${section.items?.map((item: any, index: number) => {
                          // Skip examples and text-only items in the problem list
                          if (item.type === 'example' || item.type === 'text' || item.type === 'passage') {
                            const typeLabel = item.type === 'example' ? 'Example' :
                                            item.type === 'passage' ? 'Reading Passage' : 'Instructions';
                            return `<div class="materials">
                              <strong>${typeLabel}:</strong> ${this.escapeHtml(item.content)}
                            </div>`;
                          }

                          // Clean the content to remove existing numbering patterns
                          let cleanContent = item.content || '';
                          cleanContent = String(cleanContent)
                            .replace(/^\s*\d+\.\s+/, '')    // Remove "1. " pattern
                            .replace(/^\s*\d+\)\s*/, '')    // Remove "1)" pattern
                            .replace(/^\s*\(\d+\)\s*/, '')  // Remove "(1)" pattern
                            .replace(/^Question\s+\d+:?\s*/i, '') // Remove "Question 1:" pattern
                            .replace(/^Q\d+:?\s*/i, '');    // Remove "Q1:" pattern

                          return `
                            <li style="margin: 10px 0;">
                              <strong>${this.escapeHtml(cleanContent)}</strong>
                              ${item.type === 'multiple-choice' && item.choices ? `
                                <ul style="list-style-type: upper-alpha; margin-top: 5px;">
                                  ${item.choices.map((choice: string) =>
                                    `<li>${this.escapeHtml(String(choice).replace(/^\s*[A-H]\s*[.):]\s*/i, ''))}</li>`
                                  ).join('')}
                                </ul>
                              ` : ''}
                              <div style="color: #28a745; margin-top: 5px;">
                                <em>Type: ${this.escapeHtml(item.type || 'unknown')}</em>
                                ${item.blankLines ? ` | Lines: ${item.blankLines}` : ''}
                              </div>
                              ${item.answer ? `
                                <div style="color: #28a745; margin-top: 5px;">
                                  <strong>Answer:</strong> ${this.escapeHtml(item.answer)}
                                </div>
                              ` : ''}
                              ${item.commonErrors && item.commonErrors.length ? `
                                <div style="margin-top: 5px; color: #dc3545;">
                                  ⚠️ Common errors: ${item.commonErrors.map((err: string) =>
                                    this.escapeHtml(err)
                                  ).join(', ')}
                                </div>
                              ` : ''}
                            </li>
                          `;
                        }).join('') || ''}
                      </ol>
                    </div>
                  `).join('') || ''}
                </div>
              `;
            }).join('') || '';
          }

          // Fallback to original sample problems if no full lesson data
          return tlp.studentProblems?.map((studentSet: any) => `
            <div class="student-problems">
              <h4>Student: ${this.escapeHtml(studentSet.studentInitials || '')}</h4>
              <ol>
                ${studentSet.problems?.map((problem: any) => `
                  <li>
                    <strong>Problem ${this.escapeHtml(problem.number || '')}:</strong>
                    ${this.escapeHtml(problem.question || '')}
                    ${problem.choices ? `
                      <ul style="list-style-type: upper-alpha;">
                        ${problem.choices.map((choice: string) =>
                          `<li>${this.escapeHtml(choice)}</li>`
                        ).join('')}
                      </ul>
                    ` : ''}
                    <span class="problem-answer">Answer: ${this.escapeHtml(problem.answer || '')}</span>
                    ${problem.commonErrors?.length ? `
                      <div style="margin-top: 5px; color: #dc3545;">
                        ⚠️ Common errors: ${problem.commonErrors.map((err: string) =>
                          this.escapeHtml(err)
                        ).join(', ')}
                      </div>
                    ` : ''}
                  </li>
                `).join('') || ''}
              </ol>
            </div>
          `).join('') || '';
        })()}
      </div>
      
      ${tlp.teachingNotes ? `
        <div style="margin: 20px 0; padding: 10px; background: #f0f0f0; border-radius: 4px;">
          <h3>📌 Teaching Notes</h3>
          ${tlp.teachingNotes.pacing?.length ? `
            <p><strong>Pacing:</strong> ${tlp.teachingNotes.pacing.map((note: string) => 
              this.escapeHtml(note)
            ).join('; ')}</p>
          ` : ''}
          ${tlp.teachingNotes.differentiation?.length ? `
            <p><strong>Differentiation:</strong> ${tlp.teachingNotes.differentiation.map((note: string) => 
              this.escapeHtml(note)
            ).join('; ')}</p>
          ` : ''}
          ${tlp.teachingNotes.checkpoints?.length ? `
            <p><strong>Checkpoints:</strong> ${tlp.teachingNotes.checkpoints.map((note: string) => 
              this.escapeHtml(note)
            ).join('; ')}</p>
          ` : ''}
        </div>
      ` : ''}
    </div>`;
  }

  private renderGradeGroups(lesson: LessonResponse): string {
    // Guard against missing metadata or gradeGroups
    if (!lesson?.metadata?.gradeGroups || !Array.isArray(lesson.metadata.gradeGroups)) {
      return '';
    }
    
    const groups = lesson.metadata.gradeGroups;
    
    // Additional check for empty array
    if (groups.length === 0) {
      return '';
    }

    return `
    <div class="section">
      <h2>Grade Groups</h2>
      ${groups.map((group, index) => `
        <div class="role-specific">
          <h3>Group ${index + 1}: Grades ${this.escapeHtml(group.grades.join(', '))}</h3>
          ${group.readingLevels ? `<p><strong>Reading Levels:</strong> ${this.escapeHtml(group.readingLevels.join(', '))}</p>` : ''}
          ${group.studentCount ? `<p><strong>Student Count:</strong> ${this.escapeHtml(String(group.studentCount))}</p>` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  private renderDifferentiationStrategies(lesson: LessonResponse): string {
    const strategies = [
      lesson.lesson.differentiation?.below,
      lesson.lesson.differentiation?.onLevel,
      lesson.lesson.differentiation?.above
    ].filter(Boolean);

    if (strategies.length === 0) return '';

    return `
    <div class="section">
      <h2>Differentiation Strategies</h2>
      ${lesson.lesson.differentiation?.below ? `
        <div class="role-specific">
          <h3>Below Grade Level</h3>
          <p>${this.escapeHtml(lesson.lesson.differentiation.below)}</p>
        </div>
      ` : ''}
      ${lesson.lesson.differentiation?.onLevel ? `
        <div class="role-specific">
          <h3>On Grade Level</h3>
          <p>${this.escapeHtml(lesson.lesson.differentiation.onLevel)}</p>
        </div>
      ` : ''}
      ${lesson.lesson.differentiation?.above ? `
        <div class="role-specific">
          <h3>Above Grade Level</h3>
          <p>${this.escapeHtml(lesson.lesson.differentiation.above)}</p>
        </div>
      ` : ''}
    </div>`;
  }
}

// Export singleton instance
export const worksheetRenderer = new WorksheetRenderer();