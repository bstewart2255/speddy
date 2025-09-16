/**
 * Shared utility for formatting AI-generated lesson content
 * Ensures consistent formatting across all modals and views
 *
 * SIMPLIFIED: Merged ai-lesson-standardizer functionality to avoid duplicate processing (Issue #268)
 */

import { getSanitizedHTML } from '../sanitize-html';
import { formatLessonContent } from './lesson-formatter';
// MERGED: standardizeLessonStructure functionality integrated directly to avoid duplicate processing (Issue #268)

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
}

/**
 * Process AI lesson content with enhanced formatting
 * This is the main formatter that should be used across all components
 */
export function processAILessonContent(content: string, students: Student[] = []): { __html: string } | null {
  if (!content) return null;

  console.log('[FORMATTER] Processing AI lesson content');

  // Process content directly without duplicate standardization
  let processedContent = content;
  
  // Remove redundant headers that are already shown in the UI
  processedContent = processedContent.replace(
    /<h1[^>]*>\s*Special Education Lesson Plan\s*<\/h1>/gi,
    ''
  );
  
  // Remove grade level and duration line (e.g., "Grades 3-4 | 30 Minutes")
  processedContent = processedContent.replace(
    /<p[^>]*>\s*Grade[s]?\s+[^<]*\|\s*\d+\s*[Mm]inutes?\s*<\/p>/gi,
    ''
  );
  
  // Also remove if it's in a heading format
  processedContent = processedContent.replace(
    /<h[2-6][^>]*>\s*Grade[s]?\s+[^<]*\|\s*\d+\s*[Mm]inutes?\s*<\/h[2-6]>/gi,
    ''
  );
  
  // Apply the base lesson formatting (icons, keywords, etc.)
  processedContent = formatLessonContent(processedContent);
  
  // Highlight student names with colored badges
  if (students && students.length > 0) {
    students.forEach((student, index) => {
      const colors = [
        'from-purple-500 to-pink-500',
        'from-blue-500 to-cyan-500',
        'from-green-500 to-emerald-500',
        'from-orange-500 to-red-500',
        'from-indigo-500 to-purple-500'
      ];
      const colorClass = colors[index % colors.length];
      
      // Replace student references with styled badges
      const studentRegex = new RegExp(`\\b(${student.initials}|Student ${index + 1})\\b`, 'g');
      processedContent = processedContent.replace(
        studentRegex,
        `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r ${colorClass} text-white">${student.initials}</span>`
      );
    });
  }
  
  // Add activity blocks with better visual separation
  processedContent = processedContent.replace(
    /<h3>([^<]*Activity[^<]*)<\/h3>/gi,
    '</div><div class="activity-block mt-6"><h3 class="flex items-center gap-2"><svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>$1</h3>'
  );
  
  // Clean up any unclosed divs from activity block replacements
  processedContent = processedContent.replace(
    /<div class="activity-block/g,
    '</div><div class="activity-block'
  ).replace(
    /^<\/div>/, ''
  );
  
  // Add section dividers for better visual separation
  processedContent = processedContent.replace(
    /<h2>/g,
    '<div class="my-8 border-t-2 border-gray-200"></div><h2>'
  );
  
  // Ensure we wrap the content properly and close any open divs
  processedContent = `<div class="ai-lesson-content">${processedContent}</div>`;
  
  // Sanitize and return the final HTML
  return getSanitizedHTML(processedContent);
}

/**
 * Process AI lesson content for printing
 * Removes interactive elements and optimizes for paper output
 */
export function processAILessonContentForPrint(content: string, students: Student[] = []): { __html: string } | null {
  if (!content) return null;
  
  let processedContent = content;
  
  // Remove redundant headers
  processedContent = processedContent.replace(
    /<h1[^>]*>\s*Special Education Lesson Plan\s*<\/h1>/gi,
    ''
  );
  
  processedContent = processedContent.replace(
    /<p[^>]*>\s*Grade[s]?\s+[^<]*\|\s*\d+\s*[Mm]inutes?\s*<\/p>/gi,
    ''
  );
  
  processedContent = processedContent.replace(
    /<h[2-6][^>]*>\s*Grade[s]?\s+[^<]*\|\s*\d+\s*[Mm]inutes?\s*<\/h[2-6]>/gi,
    ''
  );
  
  // For print, use simpler student name formatting
  if (students && students.length > 0) {
    students.forEach((student, index) => {
      const studentRegex = new RegExp(`\\b(${student.initials}|Student ${index + 1})\\b`, 'g');
      processedContent = processedContent.replace(
        studentRegex,
        `<strong style="text-decoration: underline;">${student.initials}</strong>`
      );
    });
  }
  
  // Simple activity headers for print
  processedContent = processedContent.replace(
    /<h3>([^<]*Activity[^<]*)<\/h3>/gi,
    '<h3 style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc;">📌 $1</h3>'
  );
  
  // Add section dividers
  processedContent = processedContent.replace(
    /<h2>/g,
    '<h2 style="margin-top: 30px; padding-top: 15px; border-top: 2px solid #333;">'
  );
  
  // Clean up empty paragraphs
  processedContent = processedContent.replace(/<p[^>]*>\s*<\/p>/gi, '');
  
  // Sanitize and return
  return getSanitizedHTML(processedContent);
}