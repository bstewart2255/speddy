/**
 * Utility for handling lesson content that might be JSON or HTML
 * Provides a consistent way to display lesson content across the app
 */

import React from 'react';
import { JsonLessonRenderer } from './json-lesson-renderer';
import { processAILessonContent, processAILessonContentForPrint } from './ai-lesson-formatter';
import { getSanitizedHTML } from '../sanitize-html';

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
}

interface LessonContentHandlerProps {
  content: string | null;
  students?: Student[];
  className?: string;
}

/**
 * Determines if content is a JSON lesson response
 */
export function isJsonLesson(content: string | null): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return !!(parsed.lesson && (parsed.studentMaterials || parsed.metadata));
  } catch {
    return false;
  }
}

/**
 * Component that intelligently renders lesson content
 * Handles both JSON lesson responses and HTML content
 */
export function LessonContentHandler({ 
  content, 
  students = [], 
  className = '' 
}: LessonContentHandlerProps) {
  if (!content) {
    return <div className="text-gray-500">No lesson content available</div>;
  }

  // Check if content is JSON lesson
  if (isJsonLesson(content)) {
    return (
      <div className={className}>
        <JsonLessonRenderer 
          lessonData={content} 
          students={students.map(s => ({
            id: s.id,
            initials: s.initials,
            grade_level: s.grade_level
          }))}
        />
      </div>
    );
  }

  // Otherwise, treat as HTML content
  const sanitizedContent = processAILessonContent(content, students);
  
  if (!sanitizedContent) {
    return <div className="text-gray-500">Unable to process lesson content</div>;
  }

  return (
    /* biome-ignore lint/security/noDangerouslySetInnerHtml: content sanitized via getSanitizedHTML in processAILessonContent */
    <div 
      className={`prose max-w-none ${className}`}
      dangerouslySetInnerHTML={sanitizedContent}
    />
  );
}

/**
 * Utility function to get printable HTML from lesson content
 */
export async function getPrintableContent(
  content: string | null, 
  students: Student[] = []
): Promise<string> {
  if (!content) return '';

  // Check if content is JSON lesson
  if (isJsonLesson(content)) {
    try {
      const rendererModule = await import('../lessons/renderer');
      const { WorksheetRenderer } = rendererModule;
      const renderer = new WorksheetRenderer();
      const fullHtml = renderer.renderLessonPlan(JSON.parse(content));
      
      // Extract only the body content to embed inside our print wrapper
      if (typeof window !== 'undefined' && 'DOMParser' in window) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(fullHtml, 'text/html');
        return doc.body.innerHTML || fullHtml;
      }
      // Fallback for non-browser environments
      const match = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      return match ? match[1] : fullHtml;
    } catch (error) {
      console.error('Error rendering JSON lesson for print:', error);
      return '<p>Error rendering lesson content</p>';
    }
  }

  // Otherwise, treat as HTML content - use print-specific formatter
  const printSanitized = processAILessonContentForPrint(content, students);
  return printSanitized ? printSanitized.__html : '';
}

/**
 * Hook to determine content type and provide appropriate handlers
 */
export function useLessonContent(content: string | null) {
  const isJson = React.useMemo(() => isJsonLesson(content), [content]);
  
  const parsedContent = React.useMemo(() => {
    if (!content || !isJson) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content, isJson]);

  return {
    isJson,
    parsedContent,
    contentType: isJson ? 'json' : 'html'
  };
}