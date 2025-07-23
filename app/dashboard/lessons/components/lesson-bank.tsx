'use client';

import { useState, useEffect } from 'react';
import { TrashIcon, PrinterIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/app/contexts/toast-context';
import { createClient } from '@/lib/supabase/client';

interface Lesson {
  id: string;
  title: string;
  subject: string;
  grade: string;
  time_duration: string;
  content: string;
  created_at: string;
}

const subjectOptions = [
  'All Subjects',
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

const gradeOptions = [
  'All Grades',
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

export default function LessonBank() {
  const { showToast } = useToast();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [filteredLessons, setFilteredLessons] = useState<Lesson[]>([]);
  const [filterSubject, setFilterSubject] = useState('All Subjects');
  const [filterGrade, setFilterGrade] = useState('All Grades');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchLessons();
  }, []);

  useEffect(() => {
    filterLessons();
  }, [lessons, filterSubject, filterGrade]);

  const fetchLessons = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/lessons');
      if (!response.ok) throw new Error('Failed to fetch lessons');
      
      const data = await response.json();
      setLessons(data);
    } catch (error) {
      showToast('Failed to load lessons', 'error');
      console.error('Error fetching lessons:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterLessons = () => {
    let filtered = [...lessons];
    
    if (filterSubject !== 'All Subjects') {
      filtered = filtered.filter(lesson => lesson.subject === filterSubject);
    }
    
    if (filterGrade !== 'All Grades') {
      filtered = filtered.filter(lesson => lesson.grade === filterGrade);
    }
    
    setFilteredLessons(filtered);
  };

  const handleDelete = async (lessonId: string) => {
    try {
      const response = await fetch(`/api/lessons/${lessonId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete lesson');
      
      showToast('Lesson deleted successfully', 'success');
      setLessons(lessons.filter(lesson => lesson.id !== lessonId));
      setDeleteConfirmId(null);
    } catch (error) {
      showToast('Failed to delete lesson', 'error');
      console.error('Error deleting lesson:', error);
    }
  };

  const handlePrint = (lesson: Lesson) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Please allow popups to print the lesson', 'error');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${lesson.title} - ${lesson.grade} ${lesson.subject}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1, h2, h3 {
              color: #2c3e50;
            }
            .header {
              border-bottom: 2px solid #3498db;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .meta-info {
              color: #666;
              font-size: 14px;
              margin-bottom: 20px;
            }
            @media print {
              body {
                margin: 0;
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${lesson.title}</h1>
            <div class="meta-info">
              <strong>Grade:</strong> ${lesson.grade} | 
              <strong>Subject:</strong> ${lesson.subject} | 
              <strong>Duration:</strong> ${lesson.time_duration}
            </div>
          </div>
          <div class="content">
            ${lesson.content}
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2 text-gray-700">
          <FunnelIcon className="w-5 h-5" />
          <span className="font-medium">Filter by:</span>
        </div>
        
        <select
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          {subjectOptions.map(subject => (
            <option key={subject} value={subject}>{subject}</option>
          ))}
        </select>
        
        <select
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          {gradeOptions.map(grade => (
            <option key={grade} value={grade}>{grade}</option>
          ))}
        </select>
      </div>

      {/* Lesson Grid */}
      {filteredLessons.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {lessons.length === 0 
              ? "You haven't saved any lessons yet. Create your first lesson in the AI Lesson Builder!"
              : "No lessons match your filters. Try adjusting your selection."
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLessons.map(lesson => (
            <div key={lesson.id} className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                  {lesson.title}
                </h3>
                
                <div className="space-y-1 text-sm text-gray-600 mb-4">
                  <p><span className="font-medium">Subject:</span> {lesson.subject}</p>
                  <p><span className="font-medium">Grade:</span> {lesson.grade}</p>
                  <p><span className="font-medium">Duration:</span> {lesson.time_duration}</p>
                  <p><span className="font-medium">Created:</span> {new Date(lesson.created_at).toLocaleDateString()}</p>
                </div>

                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handlePrint(lesson)}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <PrinterIcon className="w-4 h-4 mr-2" />
                    Print
                  </button>
                  
                  {deleteConfirmId === lesson.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(lesson.id)}
                        className="px-3 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-3 py-2 text-sm font-medium rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(lesson.id)}
                      className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}