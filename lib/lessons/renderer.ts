// Worksheet renderer - converts JSON to HTML
import { LessonResponse, StudentMaterial, WorksheetContent } from './schema';

export class WorksheetRenderer {
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
  <title>${plan.title}</title>
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
  <h1>${plan.title}</h1>
  
  <div class="section">
    <h2>Lesson Overview</h2>
    <p><strong>Duration:</strong> ${plan.duration} minutes</p>
    <div class="materials">
      <strong>Materials:</strong> ${plan.materials}
    </div>
    <p>${plan.overview}</p>
  </div>

  <div class="section">
    <h2>Learning Objectives</h2>
    <ul class="objectives">
      ${plan.objectives.map(obj => `<li>${obj}</li>`).join('')}
    </ul>
  </div>

  <div class="section">
    <h2>Introduction</h2>
    <span class="time">${plan.introduction.duration} minutes</span>
    <div class="activity">
      <p>${plan.introduction.description}</p>
      <h4>Instructions:</h4>
      <ol>
        ${plan.introduction.instructions.map(inst => `<li>${inst}</li>`).join('')}
      </ol>
    </div>
  </div>

  <div class="section">
    <h2>Main Activity</h2>
    <span class="time">${plan.mainActivity.duration} minutes</span>
    <div class="activity">
      <p>${plan.mainActivity.description}</p>
      <h4>Instructions:</h4>
      <ol>
        ${plan.mainActivity.instructions.map(inst => `<li>${inst}</li>`).join('')}
      </ol>
    </div>
  </div>

  <div class="section">
    <h2>Closure</h2>
    <span class="time">${plan.closure.duration} minutes</span>
    <div class="activity">
      <p>${plan.closure.description}</p>
      <h4>Instructions:</h4>
      <ol>
        ${plan.closure.instructions.map(inst => `<li>${inst}</li>`).join('')}
      </ol>
    </div>
  </div>

  ${this.renderRoleSpecificContent(plan.roleSpecificContent)}

  <div class="section">
    <h2>Student Groups</h2>
    ${this.renderGradeGroups(lesson)}
  </div>
</body>
</html>`;
  }

  /**
   * Renders a student worksheet to HTML
   */
  renderStudentWorksheet(
    material: StudentMaterial, 
    studentName: string = 'Student',
    qrCodeUrl?: string
  ): string {
    const { worksheet } = material;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${worksheet.title}</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      font-size: 14pt;
      line-height: 1.8;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.5in;
    }
    .header {
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .name-date {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .name-date input {
      border: none;
      border-bottom: 1px solid #333;
      font-size: 14pt;
      width: 200px;
    }
    h1 { 
      font-size: 20pt; 
      margin: 10px 0;
    }
    .instructions {
      background: #f0f0f0;
      padding: 10px;
      margin: 15px 0;
      border-left: 4px solid #333;
    }
    .section {
      margin: 30px 0;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 16pt;
      font-weight: bold;
      margin-bottom: 10px;
      border-bottom: 1px solid #999;
    }
    .item {
      margin: 20px 0;
    }
    .item-number {
      font-weight: bold;
      margin-right: 10px;
    }
    .answer-space-small {
      height: 30px;
      border-bottom: 1px solid #999;
      margin: 10px 0;
    }
    .answer-space-medium {
      height: 60px;
      border-bottom: 1px solid #999;
      margin: 10px 0;
    }
    .answer-space-large {
      height: 120px;
      border: 1px solid #999;
      margin: 10px 0;
      padding: 5px;
    }
    .answer-lines {
      border-bottom: 1px solid #999;
      height: 30px;
      margin: 5px 0;
    }
    .multiple-choice {
      margin: 10px 0 10px 30px;
    }
    .visual-support {
      border: 1px dashed #666;
      padding: 10px;
      margin: 10px 0;
      background: #fafafa;
      font-style: italic;
    }
    .qr-code {
      position: absolute;
      top: 0.5in;
      right: 0.5in;
      width: 100px;
      height: 100px;
    }
    @media print {
      body { 
        font-size: 12pt;
        padding: 0.25in;
      }
      .section { page-break-inside: avoid; }
      .header { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  ${qrCodeUrl ? `<img src="${qrCodeUrl}" alt="QR Code" class="qr-code">` : ''}
  
  <div class="header">
    <div class="name-date">
      <div>Name: <input type="text" value="${studentName}"></div>
      <div>Date: <input type="text"></div>
    </div>
    <h1>${worksheet.title}</h1>
  </div>

  <div class="instructions">
    <strong>Instructions:</strong> ${worksheet.instructions}
  </div>

  ${worksheet.content.map(section => this.renderWorksheetSection(section)).join('')}

  ${material.worksheet.accommodations && material.worksheet.accommodations.length > 0 ? `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #333;">
      <small><strong>Accommodations applied:</strong> ${material.worksheet.accommodations.join(', ')}</small>
    </div>
  ` : ''}
</body>
</html>`;
  }

  private renderWorksheetSection(section: WorksheetContent): string {
    return `
    <div class="section">
      <div class="section-title">${section.sectionTitle}</div>
      <p>${section.instructions}</p>
      
      ${section.items.map((item, index) => `
        <div class="item">
          ${item.type === 'visual' ? '' : `<span class="item-number">${index + 1}.</span>`}
          ${item.visualSupport ? `<div class="visual-support">${item.visualSupport}</div>` : ''}
          <span>${item.content}</span>
          
          ${item.choices ? `
            <div class="multiple-choice">
              ${item.choices.map((choice, i) => `
                <div>☐ ${String.fromCharCode(65 + i)}. ${choice}</div>
              `).join('')}
            </div>
          ` : ''}
          
          ${item.blankLines ? 
            Array(item.blankLines).fill(0).map(() => '<div class="answer-lines"></div>').join('') 
            : ''
          }
          
          ${item.space ? `<div class="answer-space-${item.space}"></div>` : ''}
        </div>
      `).join('')}
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
    
    return groups.map((group, index) => `
      <div style="margin: 10px 0;">
        <strong>Group ${index + 1}:</strong> 
        Grades ${group.grades.join(', ')} 
        (${group.studentIds.length} students) - 
        Activity Level: ${group.activityLevel}
      </div>
    `).join('');
  }

  /**
   * Renders answer key for a lesson
   */
  renderAnswerKey(lesson: LessonResponse): string {
    const materialsWithKeys = lesson.studentMaterials.filter(m => m.answerKey);
    
    if (materialsWithKeys.length === 0) {
      return '<p>No answer key available for this lesson.</p>';
    }
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Answer Key - ${lesson.lesson.title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #d32f2f; }
    .student-key { margin: 20px 0; padding: 15px; border: 1px solid #ddd; }
    .answer { margin: 5px 0; padding: 5px; background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>ANSWER KEY - ${lesson.lesson.title}</h1>
  
  ${materialsWithKeys.map(material => `
    <div class="student-key">
      <h2>Student ${material.studentId}</h2>
      ${material.answerKey!.items.map(item => `
        <div class="answer">
          <strong>Question ${item.itemNumber}:</strong> ${item.correctAnswer}
          ${item.acceptableVariations ? 
            `<br><small>Also accept: ${item.acceptableVariations.join(', ')}</small>` 
            : ''}
        </div>
      `).join('')}
    </div>
  `).join('')}
</body>
</html>`;
  }
}

// Export singleton instance
export const worksheetRenderer = new WorksheetRenderer();