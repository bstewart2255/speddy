/**
 * Utilities for formatting lesson content with enhanced visual hierarchy
 */

export const formatLessonContent = (content: string): string => {
  if (!content) return '';
  
  let formatted = content;
  
  // Clean up any redundant headers that might still exist
  // Remove standalone "Special Education" headers
  formatted = formatted.replace(
    /<h[1-6][^>]*>\s*Special Education\s*<\/h[1-6]>/gi,
    ''
  );
  
  // Remove lesson plan headers that are too generic
  formatted = formatted.replace(
    /<h1[^>]*>\s*Lesson Plan\s*<\/h1>/gi,
    ''
  );
  
  // Clean up empty paragraphs that might result from removals
  formatted = formatted.replace(/<p[^>]*>\s*<\/p>/gi, '');
  
  // Remove duplicate line breaks
  formatted = formatted.replace(/(\n\s*){3,}/g, '\n\n');
  
  // Add icons to main section headers
  const sectionIcons: Record<string, string> = {
    'objective': '🎯',
    'material': '📚',
    'activity': '🎮',
    'assessment': '📊',
    'homework': '📝',
    'warm-up': '🔥',
    'introduction': '👋',
    'closure': '🔚',
    'differentiation': '🎨',
    'accommodation': '♿',
    'modification': '🔧',
    'extension': '🚀',
    'vocabulary': '📖',
    'skill': '💪',
    'goal': '🎯',
    'standard': '📏',
    'note': '📌',
    'reminder': '⏰',
    'tip': '💡'
  };
  
  // Add icons to h2 headers
  Object.entries(sectionIcons).forEach(([keyword, icon]) => {
    const regex = new RegExp(`<h2>([^<]*${keyword}[^<]*)</h2>`, 'gi');
    formatted = formatted.replace(regex, `<h2>${icon} $1</h2>`);
  });
  
  // Format time durations with clock icon
  formatted = formatted.replace(
    /\((\d+[\s-]*(?:min(?:ute)?s?|hour?s?))\)/gi,
    '<span class="inline-flex items-center gap-1 text-blue-600 font-medium">⏱️ $1</span>'
  );
  
  // Highlight important keywords
  const importantKeywords = [
    'IMPORTANT',
    'NOTE',
    'REMINDER',
    'TIP',
    'WARNING',
    'CAUTION'
  ];
  
  importantKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b(${keyword}:?)\\b`, 'g');
    formatted = formatted.replace(
      regex,
      '<span class="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 font-bold text-xs uppercase rounded">$1</span>'
    );
  });
  
  // Format numbered steps with better styling
  formatted = formatted.replace(
    /<li>(\d+\.?\s*)/g,
    '<li><span class="font-bold text-blue-600">$1</span>'
  );
  
  // Add visual breaks between major sections
  formatted = formatted.replace(
    /(<\/h2>)/g,
    '$1<hr class="my-4 border-t-2 border-gray-100" />'
  );
  
  // Wrap entire content in a container with proper spacing
  formatted = `
    <div class="lesson-content-wrapper space-y-6">
      ${formatted}
    </div>
  `;
  
  return formatted;
};