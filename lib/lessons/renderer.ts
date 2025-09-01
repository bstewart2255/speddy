// Worksheet renderer - converts JSON to HTML with XSS protection
import { LessonResponse, StudentMaterial, WorksheetContent } from './schema';

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
    @media print {
      body { max-width: 100%; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(plan.title)}</h1>
  
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
    <h2>Main Activity</h2>
    <span class="time">${this.escapeHtml(String(plan.mainActivity.duration))} minutes</span>
    <div class="activity">
      <p>${this.escapeHtml(plan.mainActivity.description)}</p>
      <h4>Instructions:</h4>
      <ol>
        ${plan.mainActivity.instructions.map(inst => `<li>${this.escapeHtml(inst)}</li>`).join('')}
      </ol>
    </div>
  </div>

  <div class="section">
    <h2>Closure</h2>
    <span class="time">${this.escapeHtml(String(plan.closure.duration))} minutes</span>
    <div class="activity">
      <p>${this.escapeHtml(plan.closure.description)}</p>
      <h4>Instructions:</h4>
      <ol>
        ${plan.closure.instructions.map(inst => `<li>${this.escapeHtml(inst)}</li>`).join('')}
      </ol>
    </div>
  </div>

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
      padding: 20px;
    }
    h1 { 
      color: #333; 
      font-size: 1.5em;
      text-align: center;
      margin-bottom: 10px;
    }
    .header {
      border: 2px solid #333;
      padding: 10px;
      margin-bottom: 20px;
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
      padding: 10px;
      margin: 15px 0;
      border-left: 3px solid #007bff;
      font-size: 1em;
    }
    .section {
      margin: 20px 0;
      page-break-inside: avoid;
    }
    .section h2 {
      font-size: 1.2em;
      color: #555;
      margin-bottom: 10px;
    }
    .item {
      margin: 15px 0;
      padding: 10px;
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
      min-height: 25px;
      margin: 8px 0;
    }
    .accommodations {
      background: #ffffcc;
      padding: 8px;
      margin: 10px 0;
      border: 1px dashed #ff9900;
      font-size: 0.9em;
    }
    @media print {
      body { max-width: 100%; }
      .header { page-break-inside: avoid; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="student-info">
      <strong>Name:</strong> ${this.escapeHtml(studentName) || '____________________'}<br>
      <strong>Date:</strong> ____________________<br>
      <strong>Grade:</strong> ${this.escapeHtml(String(material.gradeGroup))}
    </div>
    ${qrCodeUrl ? `<img src="${this.escapeHtml(qrCodeUrl)}" alt="QR Code" class="qr-code">` : ''}
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

  ${(worksheet.sections || []).map((section, sectionIndex) => `
    <div class="section">
      <h2>Part ${sectionIndex + 1}: ${this.escapeHtml(section.title)}</h2>
      ${section.instructions ? `<p><em>${this.escapeHtml(section.instructions)}</em></p>` : ''}
      
      ${section.items.map((item, itemIndex) => this.renderWorksheetItem(item, sectionIndex, itemIndex)).join('')}
    </div>
  `).join('')}

</body>
</html>`;
  }

  private renderWorksheetItem(item: any, sectionIndex: number, itemIndex: number): string {
    return `
    <div class="item">
      <div class="question">${sectionIndex + 1}.${itemIndex + 1}. ${this.escapeHtml(item.content)}</div>
      ${item.type === 'multiple-choice' && item.choices ? `
        <ul class="choices">
          ${item.choices.map((choice: string) => `<li>${this.escapeHtml(choice)}</li>`).join('')}
        </ul>
      ` : item.type === 'short-answer' ? `
        <div class="answer-space"></div>
      ` : item.type === 'fill-in-blank' ? `
        <div class="answer-space"></div>
      ` : `
        <div class="answer-lines"></div>
        <div class="answer-lines"></div>
        <div class="answer-lines"></div>
      `}
    </div>`;
  }

  private renderRoleSpecificContent(content: any): string {
    if (!content) return '';
    
    const items: string[] = [];
    
    if (content.differentiationStrategies) {
      items.push(`
        <h3>Differentiation Strategies</h3>
        <ul>${content.differentiationStrategies.map((s: string) => `<li>${s}</li>`).join('')}</ul>
      `);
    }
    
    if (content.scaffoldingSteps) {
      items.push(`
        <h3>Scaffolding Steps</h3>
        <ol>${content.scaffoldingSteps.map((s: string) => `<li>${s}</li>`).join('')}</ol>
      `);
    }
    
    if (content.fineMotorActivities) {
      items.push(`
        <h3>Fine Motor Activities</h3>
        <ul>${content.fineMotorActivities.map((s: string) => `<li>${s}</li>`).join('')}</ul>
      `);
    }
    
    if (content.sensorySupports) {
      items.push(`
        <h3>Sensory Supports</h3>
        <ul>${content.sensorySupports.map((s: string) => `<li>${s}</li>`).join('')}</ul>
      `);
    }
    
    if (content.articulationTargets) {
      items.push(`
        <h3>Articulation Targets</h3>
        <ul>${content.articulationTargets.map((s: string) => `<li>${s}</li>`).join('')}</ul>
      `);
    }
    
    if (content.languageGoals) {
      items.push(`
        <h3>Language Goals</h3>
        <ul>${content.languageGoals.map((s: string) => `<li>${s}</li>`).join('')}</ul>
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