/**
 * Utility for handling lesson content that might be JSON or HTML
 * Provides a consistent way to display lesson content across the app
 */

import React from 'react';
import { JsonLessonRenderer } from './json-lesson-renderer';
import { processAILessonContent } from './ai-lesson-formatter';
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
    <div 
      className={`prose max-w-none ${className}`}
      dangerouslySetInnerHTML={sanitizedContent}
    />
  );
}

/**
 * Utility function to get printable HTML from lesson content
 */
export function getPrintableContent(
  content: string | null, 
  students: Student[] = []
): string {
  if (!content) return '';

  // Check if content is JSON lesson
  if (isJsonLesson(content)) {
    try {
      const { WorksheetRenderer } = require('../../lib/lessons/renderer');
      const renderer = new WorksheetRenderer();
      return renderer.renderLessonPlan(JSON.parse(content));
    } catch (error) {
      console.error('Error rendering JSON lesson for print:', error);
      return '<p>Error rendering lesson content</p>';
    }
  }

  // Otherwise, treat as HTML content
  const sanitized = getSanitizedHTML(content);
  return sanitized.__html;
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