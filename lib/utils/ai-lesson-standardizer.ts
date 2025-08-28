/**
 * Standardizes AI-generated lesson content to ensure consistent structure
 * This post-processes the AI output to enforce a uniform format
 */

interface ParsedSection {
  title: string;
  duration?: string;
  content: string;
}

/**
 * Standardize the structure of AI-generated lesson content
 * Ensures all lessons follow the same format regardless of how the AI generated them
 */
export function standardizeLessonStructure(content: string): string {
  if (!content) return content;
  
  // Remove any existing titles that might be inconsistent
  let processedContent = content;
  
  // Remove various forms of lesson plan titles
  processedContent = processedContent.replace(
    /<h1[^>]*>.*?(?:lesson plan|session plan|therapy plan).*?<\/h1>/gi,
    ''
  );
  
  // Remove standalone headers that are too generic
  processedContent = processedContent.replace(
    /^.*?(?:Special Education Lesson Plan|Lesson Plan:|Here is a detailed).*?$/gmi,
    ''
  );
  
  // Standardize time indicators - ensure they all use the clock emoji format
  processedContent = processedContent.replace(
    /\b(\d+\s*(?:min(?:ute)?s?|hour?s?))\s*:/gi,
    '⏱️ $1:'
  );
  
  // Ensure consistent section headers
  processedContent = ensureConsistentSections(processedContent);
  
  // Standardize student sections
  processedContent = standardizeStudentSections(processedContent);
  
  // Add consistent title structure
  const title = '<h2 class="lesson-title">Special Education Lesson Plan</h2>\n';
  
  // Clean up extra whitespace and empty tags
  processedContent = processedContent
    .replace(/<p[^>]*>\s*<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return title + processedContent;
}

/**
 * Ensure main sections (Opening, Main Instruction, Closing) are consistently formatted
 */
function ensureConsistentSections(content: string): string {
  // Define the standard sections we expect
  const sections = [
    { pattern: /opening|warm[- ]?up|introduction/i, standard: 'Opening' },
    { pattern: /main\s*(?:instruction|activity|activities|lesson)|core\s*(?:instruction|content)/i, standard: 'Main Instruction' },
    { pattern: /closing|conclusion|wrap[- ]?up|assessment|closure/i, standard: 'Closing' }
  ];
  
  let result = content;
  
  sections.forEach(section => {
    // Find and replace various forms of section headers
    // First try to find h3 headers
    result = result.replace(
      new RegExp(`<h3[^>]*>\\s*(?:${section.pattern.source})[^<]*<\\/h3>`, 'gi'),
      `<h3 class="section-header">${section.standard}</h3>`
    );
    
    // Then try h4 headers
    result = result.replace(
      new RegExp(`<h4[^>]*>\\s*(?:${section.pattern.source})[^<]*<\\/h4>`, 'gi'),
      `<h3 class="section-header">${section.standard}</h3>`
    );
    
    // Also check for bold text that might be acting as headers
    result = result.replace(
      new RegExp(`<(?:strong|b)>\\s*(?:${section.pattern.source})[^<]*<\\/(?:strong|b)>`, 'gi'),
      `<h3 class="section-header">${section.standard}</h3>`
    );
  });
  
  // Ensure all section headers have consistent h3 tags
  result = result.replace(
    /<h3\s+class="section-header">([^<]+)<\/h3>/gi,
    (match, p1) => {
      // Extract any time duration from the header
      const timeMatch = p1.match(/⏱️?\s*(\d+\s*(?:min(?:ute)?s?|hour?s?))/i);
      if (timeMatch) {
        const cleanTitle = p1.replace(/⏱️?\s*\d+\s*(?:min(?:ute)?s?|hour?s?):?/i, '').trim();
        return `<h3 class="section-header">${cleanTitle} <span class="duration">⏱️ ${timeMatch[1]}</span></h3>`;
      }
      return `<h3 class="section-header">${p1}</h3>`;
    }
  );
  
  return result;
}

/**
 * Standardize how student-specific content is formatted
 */
function standardizeStudentSections(content: string): string {
  // Look for patterns like "Student Name (Grade X)" or "JW (Grade 3)"
  const studentPattern = /(?:<(?:h4|strong|b)>)?([A-Z]{1,3})\s*\(Grade\s*(\d+)\)(?:<\/(?:h4|strong|b)>)?/g;
  
  let result = content;
  
  // Replace student headers with consistent formatting
  result = result.replace(
    studentPattern,
    '<h4 class="student-header"><span class="student-name">$1</span> <span class="grade-level">(Grade $2)</span></h4>'
  );
  
  // Ensure activity labels are consistent
  result = result.replace(
    /Activity\s*(\d+)\s*:/gi,
    '<strong class="activity-label">Activity $1:</strong>'
  );
  
  // Standardize IEP goal references
  result = result.replace(
    /IEP\s*Goal\s*:/gi,
    '<strong class="goal-label">IEP Goal:</strong>'
  );
  
  // Standardize focus areas
  result = result.replace(
    /Focus\s*Areas?\s*:/gi,
    '<strong class="focus-label">Focus Areas:</strong>'
  );
  
  return result;
}

/**
 * Extract and structure lesson metadata for consistent display
 */
export function extractLessonMetadata(content: string): {
  gradeLevel?: string;
  duration?: string;
  studentCount?: number;
} {
  const metadata: any = {};
  
  // Extract grade level
  const gradeMatch = content.match(/Grade[s]?\s+(\d+(?:-\d+)?)/i);
  if (gradeMatch) {
    metadata.gradeLevel = gradeMatch[1];
  }
  
  // Extract duration
  const durationMatch = content.match(/(\d+)\s*minutes?/i);
  if (durationMatch) {
    metadata.duration = `${durationMatch[1]} minutes`;
  }
  
  // Count unique students
  const studentMatches = content.match(/([A-Z]{1,3})\s*\(Grade\s*\d+\)/g);
  if (studentMatches) {
    const uniqueStudents = new Set(studentMatches.map(m => m.split('(')[0].trim()));
    metadata.studentCount = uniqueStudents.size;
  }
  
  return metadata;
}