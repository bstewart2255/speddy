'use client';

import { useState } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import LessonPreviewModal from './lesson-preview-modal';
import { parseGradeLevel } from '@/lib/utils/grade-parser';

interface FormData {
  grade: string;
  subject: string;
  topic: string;
  timeDuration: string;
}

interface WorksheetSection {
  title?: string;
  instructions?: string;
  items?: Array<string | { content?: string; question?: string }>;
}

interface Worksheet {
  title?: string;
  instructions?: string;
  sections?: WorksheetSection[];
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const gradeOptions = [
  'Kindergarten',
  '1st Grade',
  '2nd Grade',
  '3rd Grade',
  '4th Grade',
  '5th Grade',
  '6th Grade',
  '7th Grade',
  '8th Grade',
  '9th Grade',
  '10th Grade',
  '11th Grade',
  '12th Grade',
];

const subjectOptions = [
  'Math',
  'English Language Arts',
  'Science',
  'Social Studies',
  'Reading',
  'Writing',
  'History',
  'Geography',
  'Life Skills',
  'Art',
  'Music',
  'Physical Education',
];

const timeDurationOptions = [
  '5 minutes',
  '10 minutes',
  '15 minutes',
  '20 minutes',
  '30 minutes',
  '45 minutes',
  '60 minutes',
];

// Helper function to format worksheet as HTML with proper escaping
function formatWorksheetAsHtml(worksheet: Worksheet): string {
  let html = '';
  
  if (worksheet.title) {
    html += `<h3>${escapeHtml(worksheet.title)}</h3>`;
  }
  
  if (worksheet.instructions) {
    html += `<p class="instructions">${escapeHtml(worksheet.instructions)}</p>`;
  }
  
  if (worksheet.sections && Array.isArray(worksheet.sections)) {
    worksheet.sections.forEach((section: WorksheetSection) => {
      html += '<div class="worksheet-section">';
      if (section.title) {
        html += `<h4>${escapeHtml(section.title)}</h4>`;
      }
      if (section.instructions) {
        html += `<p>${escapeHtml(section.instructions)}</p>`;
      }
      if (section.items && Array.isArray(section.items)) {
        html += '<ol>';
        section.items.forEach((item) => {
          if (typeof item === 'string') {
            html += `<li>${escapeHtml(item)}</li>`;
          } else if (item.content) {
            html += `<li>${escapeHtml(item.content)}</li>`;
          } else if (item.question) {
            html += `<li>${escapeHtml(item.question)}</li>`;
          }
        });
        html += '</ol>';
      }
      html += '</div>';
    });
  }
  
  return html;
}

export default function LessonBuilder() {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<FormData>({
    grade: '',
    subject: '',
    topic: '',
    timeDuration: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [generatedLesson, setGeneratedLesson] = useState<{
    content: string;
    title: string;
  } | null>(null);

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.grade || !formData.subject || !formData.topic || !formData.timeDuration) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      // Use the structured API with a generic student profile
      const response = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: [{
            id: 'generic-' + Date.now(),
            grade: parseGradeLevel(formData.grade) || 3
          }],
          subject: formData.subject,
          topic: formData.topic,
          duration: parseInt(formData.timeDuration) || 15,
          teacherRole: 'resource'
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate lesson');
      }

      const data = await response.json();
      // Extract HTML content from the structured lesson with proper escaping
      let htmlContent = '';
      if (data.lesson) {
        // Convert structured lesson to HTML for display
        const title = escapeHtml(data.lesson.lesson?.title || formData.topic);
        const duration = escapeHtml(String(data.lesson.lesson?.duration || formData.timeDuration));
        const overview = data.lesson.lesson?.overview ? escapeHtml(data.lesson.lesson.overview) : '';
        
        htmlContent = `
          <div class="lesson-content">
            <h2>${title}</h2>
            <div class="duration">Duration: ${duration} minutes</div>
            ${overview ? `<div class="overview">${overview}</div>` : ''}
            ${data.lesson.studentMaterials?.[0]?.worksheet ? 
              formatWorksheetAsHtml(data.lesson.studentMaterials[0].worksheet) : 
              '<p>No worksheet content available</p>'
            }
          </div>
        `;
      }
      
      setGeneratedLesson({
        content: htmlContent || data.content || '<p>No content generated</p>',
        title: data.lesson?.lesson?.title || formData.topic,
      });
      setShowModal(true);
    } catch (error) {
      showToast('Failed to generate lesson. Please try again.', 'error');
      console.error('Error generating lesson:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setGeneratedLesson(null);
    // Reset form
    setFormData({
      grade: '',
      subject: '',
      topic: '',
      timeDuration: '',
    });
  };

  return (
    <>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Create a New Lesson</h2>
          <p className="text-gray-600">Fill in the details below to generate an AI-powered worksheet for your students.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-1">
              Grade Level
            </label>
            <select
              id="grade"
              value={formData.grade}
              onChange={(e) => handleInputChange('grade', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isGenerating}
            >
              <option value="">Select a grade</option>
              {gradeOptions.map(grade => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <select
              id="subject"
              value={formData.subject}
              onChange={(e) => handleInputChange('subject', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isGenerating}
            >
              <option value="">Select a subject</option>
              {subjectOptions.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-1">
              Topic
            </label>
            <input
              type="text"
              id="topic"
              value={formData.topic}
              onChange={(e) => handleInputChange('topic', e.target.value)}
              placeholder="e.g., Addition with regrouping, Parts of speech, Water cycle"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isGenerating}
            />
            <p className="mt-1 text-sm text-gray-500">Be specific about the concept or skill you want to teach</p>
          </div>

          <div>
            <label htmlFor="timeDuration" className="block text-sm font-medium text-gray-700 mb-1">
              Time Duration
            </label>
            <select
              id="timeDuration"
              value={formData.timeDuration}
              onChange={(e) => handleInputChange('timeDuration', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isGenerating}
            >
              <option value="">Select duration</option>
              {timeDurationOptions.map(duration => (
                <option key={duration} value={duration}>{duration}</option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">How long should it take students to complete this worksheet?</p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isGenerating}
              className={`
                px-6 py-3 rounded-md font-medium text-white transition-colors
                ${isGenerating 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }
              `}
            >
              {isGenerating ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Lesson...
                </span>
              ) : (
                'Create Lesson'
              )}
            </button>
          </div>
        </form>
      </div>

      {showModal && generatedLesson && (
        <LessonPreviewModal
          lesson={generatedLesson}
          formData={formData}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}