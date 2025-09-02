// lib/worksheets/worksheet-generator.ts
import * as QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '../../src/types/database';
import type { LessonResponse, StudentMaterial, WorksheetItem } from '../lessons/schema';
import { standardizeGradeLevel } from '../utils/grade-level';

interface WorksheetQuestion {
  id: string;
  type: 'multiple_choice' | 'fill_blank' | 'short_answer' | 'spelling';
  question: string;
  options?: string[]; // for multiple choice
  answer: string | number;
  points?: number;
}

interface WorksheetContent {
  title: string;
  instructions: string;
  questions: WorksheetQuestion[];
}

export async function generateWorksheetWithQR(
  lessonId: string,
  studentId: string,
  worksheetType: string,
  content: WorksheetContent
): Promise<{ worksheetId: string; qrCodeDataUrl: string }> {
  const supabase = createClient<Database>();

  // Generate unique worksheet code (not the full URL)
  const worksheetCode = `WS-${lessonId.slice(0, 8)}-${studentId.slice(0, 8)}-${Date.now()}`;

  // Save worksheet to database with just the code
  const { data: worksheet, error } = await supabase
    .from('worksheets')
    .insert({
      lesson_id: lessonId,
      student_id: studentId,
      worksheet_type: worksheetType,
      content: content as any,
      answer_key: {
        questions: content.questions.map(q => ({
          id: q.id,
          answer: q.answer,
          points: q.points || 1
        }))
      },
      qr_code: worksheetCode
    })
    .select()
    .single();

  if (error) throw error;

  // Generate QR code with URL format
  const qrUrl = `https://app.speddy.com/ws/${worksheetCode}`;
  const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 150,
    margin: 2,
    errorCorrectionLevel: 'M'
  });

  return {
    worksheetId: worksheet.id,
    qrCodeDataUrl
  };
}

// Helper function to escape HTML to prevent XSS attacks
function escapeHtml(text: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  // Fallback for server-side rendering
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper function to extract worksheet content from lesson HTML
export function extractWorksheetFromLesson(
  lessonContent: string,
  studentId: string,
  gradeLevel: string
): WorksheetContent | null {
  try {
    // Validate JSON structure before parsing
    if (!lessonContent || typeof lessonContent !== 'string') {
      throw new Error('Invalid lesson content format');
    }
    
    // Try to parse as JSON lesson content
    const lessonData = JSON.parse(lessonContent) as LessonResponse;
    
    // Check if this is a LessonResponse with studentMaterials
    if (lessonData && lessonData.studentMaterials && Array.isArray(lessonData.studentMaterials)) {
      // Find the worksheet for this specific student
      const studentMaterial: StudentMaterial | undefined = lessonData.studentMaterials.find(
        (material) => material.studentId === studentId
      );
      
      if (studentMaterial && studentMaterial.worksheet) {
        const worksheet = studentMaterial.worksheet;
        const questions: WorksheetQuestion[] = [];
        let questionId = 1;
        
        // Process worksheet sections or content
        const sectionsToProcess = worksheet.sections || 
          (worksheet.content ? [{ items: worksheet.content }] : []);
        
        for (const section of sectionsToProcess) {
          const items = section.items || [];
          
          for (const contentItem of items) {
            // Handle both nested WorksheetContent and direct WorksheetItem
            const itemsToProcess = contentItem.items || [contentItem];
            
            for (const item of itemsToProcess as WorksheetItem[]) {
              if (!item.content) continue;
              
              // Determine question type based on item properties
              let questionType: WorksheetQuestion['type'] = 'short_answer';
              
              if (item.choices && item.choices.length > 0) {
                questionType = 'multiple_choice';
              } else if (item.content.includes('___') || /_{3,}/.test(item.content)) {
                // Only match 3 or more consecutive underscores
                questionType = 'fill_blank';
              } else if (item.type === 'problem' || item.content.includes('=')) {
                questionType = 'fill_blank';
              }
              
              // Extract answer from answer key if available
              let answer = 'varies';
              if (studentMaterial.answerKey) {
                if (studentMaterial.answerKey.items && studentMaterial.answerKey.items[questionId - 1]) {
                  answer = studentMaterial.answerKey.items[questionId - 1].correctAnswer;
                } else if (studentMaterial.answerKey.answers) {
                  const answerValue = studentMaterial.answerKey.answers[`q${questionId}`] || 
                                     studentMaterial.answerKey.answers[questionId.toString()];
                  answer = Array.isArray(answerValue) ? answerValue[0] : (answerValue || 'varies');
                }
              }
              
              questions.push({
                id: questionId.toString(),
                type: questionType,
                question: item.content,
                options: item.choices,
                answer: answer,
                points: 1
              });
              
              questionId++;
            }
          }
        }
        
        // Return the extracted worksheet content
        return {
          title: worksheet.title || 'Student Worksheet',
          instructions: worksheet.instructions || 'Complete the following activities.',
          questions: questions
        };
      }
    }
  } catch (e) {
    // If JSON parsing fails or structure is not as expected, log sanitized error
    console.error('Failed to extract worksheet from lesson content:', e instanceof Error ? e.message : 'Unknown error');
  }
  
  // Fallback to grade-appropriate template worksheets if extraction fails
  // Standardize the grade level first
  const standardizedGrade = standardizeGradeLevel(gradeLevel);
  if (!standardizedGrade) {
    return null;
  }
  
  const worksheetTemplates: Record<string, WorksheetContent> = {
    'K': {
      title: 'Letter Recognition Practice',
      instructions: 'Circle the matching lowercase letter for each uppercase letter shown.',
      questions: [
        { id: '1', type: 'multiple_choice', question: 'A', options: ['a', 'e', 'o', 'u'], answer: 'a' },
        { id: '2', type: 'multiple_choice', question: 'B', options: ['d', 'b', 'p', 'q'], answer: 'b' },
        { id: '3', type: 'multiple_choice', question: 'C', options: ['c', 'e', 'o', 'a'], answer: 'c' },
      ]
    },
    '1': {
      title: 'Phonemic Awareness',
      instructions: 'Complete each word by filling in the missing letter.',
      questions: [
        { id: '1', type: 'fill_blank', question: 'c_t', answer: 'a' },
        { id: '2', type: 'fill_blank', question: 'd_g', answer: 'o' },
        { id: '3', type: 'fill_blank', question: 's_n', answer: 'u' },
      ]
    },
    '2': {
      title: 'Reading Comprehension',
      instructions: 'Read the passage and answer the questions.',
      questions: [
        { 
          id: '1', 
          type: 'short_answer', 
          question: 'The cat sat on the mat. Where did the cat sit?', 
          answer: 'on the mat' 
        },
      ]
    },
    '3': {
      title: 'Multiplication Facts',
      instructions: 'Solve each multiplication problem.',
      questions: [
        { id: '1', type: 'fill_blank', question: '3 × 4 = ___', answer: '12' },
        { id: '2', type: 'fill_blank', question: '5 × 6 = ___', answer: '30' },
        { id: '3', type: 'fill_blank', question: '7 × 8 = ___', answer: '56' },
      ]
    },
    '4': {
      title: 'Text Analysis',
      instructions: 'Read the passage and identify the main idea.',
      questions: [
        { 
          id: '1', 
          type: 'short_answer', 
          question: 'What is the main idea of the passage?', 
          answer: 'varies' 
        },
      ]
    },
    '5': {
      title: 'Fractions Practice',
      instructions: 'Add the fractions and simplify your answer.',
      questions: [
        { id: '1', type: 'fill_blank', question: '1/2 + 1/4 = ___', answer: '3/4' },
        { id: '2', type: 'fill_blank', question: '2/3 + 1/6 = ___', answer: '5/6' },
      ]
    }
  };

  return worksheetTemplates[standardizedGrade] || null;
}

// Generate printable HTML for worksheet
export function generatePrintableWorksheet(
  worksheet: WorksheetContent,
  student: { initials: string; grade_level: string },
  qrCodeDataUrl: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${worksheet.title} - ${student.initials}</title>
      <style>
        @page { margin: 0.75in; }
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6;
          max-width: 8.5in;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          border-bottom: 2px solid #333;
          padding-bottom: 10px;
        }
        .student-info {
          flex: 1;
        }
        .qr-code {
          width: 150px;
          height: 150px;
        }
        h1 { 
          font-size: 24px; 
          margin: 0 0 10px 0;
        }
        .instructions {
          background: #f0f0f0;
          padding: 10px;
          margin: 20px 0;
          border-radius: 5px;
        }
        .question {
          margin: 20px 0;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 5px;
        }
        .question-number {
          font-weight: bold;
          margin-bottom: 10px;
        }
        .answer-line {
          border-bottom: 2px solid #333;
          display: inline-block;
          width: 200px;
          margin-left: 10px;
        }
        .multiple-choice {
          margin: 10px 0;
        }
        .choice {
          margin: 5px 20px;
        }
        @media print {
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="student-info">
          <h1>${worksheet.title}</h1>
          <p><strong>Name:</strong> ${student.initials} &nbsp;&nbsp;&nbsp; 
             <strong>Grade:</strong> ${student.grade_level} &nbsp;&nbsp;&nbsp;
             <strong>Date:</strong> ________________</p>
        </div>
        <img src="${qrCodeDataUrl}" alt="QR Code" class="qr-code" />
      </div>

      <div class="instructions">
        <strong>Instructions:</strong> ${worksheet.instructions}
      </div>

      ${worksheet.questions.map((q, index) => {
        // Escape HTML in questions and options to prevent XSS
        const safeQuestion = escapeHtml(q.question);
        
        if (q.type === 'multiple_choice') {
          return `
            <div class="question">
              <div class="question-number">Question ${index + 1}</div>
              <p>${safeQuestion}</p>
              <div class="multiple-choice">
                ${(q.options ?? []).map(option => 
                  `<div class="choice">○ ${escapeHtml(option)}</div>`
                ).join('')}
              </div>
            </div>
          `;
        } else if (q.type === 'fill_blank') {
          // For fill-in-the-blank, show the question with blank lines embedded
          return `
            <div class="question">
              <div class="question-number">Question ${index + 1}</div>
              <p>${safeQuestion}</p>
              ${!q.question.includes('___') && !/_{3,}/.test(q.question) ? 
                '<br/><span class="answer-line"></span>' : ''}
            </div>
          `;
        } else if (q.type === 'spelling') {
          // For spelling questions, provide lines for writing
          return `
            <div class="question">
              <div class="question-number">Question ${index + 1}</div>
              <p>${safeQuestion}</p>
              <br/>
              ${Array.from({ length: 3 }).map(() => 
                '<span class="answer-line" style="width: 100%; margin: 10px 0;"></span><br/>'
              ).join('')}
            </div>
          `;
        } else {
          // Default short_answer type - determine number of lines needed
          const qLower = q.question.toLowerCase();
          const needsMultipleLines = q.question.length > 100 || 
                                   qLower.includes('explain') ||
                                   qLower.includes('describe');
          const lineCount = needsMultipleLines ? 3 : 1;
          
          return `
            <div class="question">
              <div class="question-number">Question ${index + 1}</div>
              <p>${safeQuestion}</p>
              <br/>
              ${Array.from({ length: lineCount }).map(() => 
                '<span class="answer-line" style="width: 100%; margin: 10px 0;"></span><br/>'
              ).join('')}
            </div>
          `;
        }
      }).join('')}

      <div class="no-print" style="margin-top: 40px; padding: 20px; background: #f9f9f9; border: 1px solid #ddd;">
        <p><strong>For Provider:</strong> After student completes, take a photo and email to: progress@speddy.xyz</p>
        <p>The QR code will automatically link this worksheet to the student's progress tracking.</p>
      </div>
    </body>
    </html>
  `;
}