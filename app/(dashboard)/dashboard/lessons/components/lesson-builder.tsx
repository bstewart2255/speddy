'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import LessonPreviewModal from './lesson-preview-modal';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface FormData {
  studentIds: string[];
  subject: string;
  topic: string;
  timeDuration: string;
}

interface Student {
  id: string;
  initials: string;
  grade_level: number;
  school_id?: string;
}

interface GeneratedLesson {
  content: any; // JSON content
  title: string;
  formData: FormData;
  lessonId?: string;
}

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

export default function LessonBuilder() {
  const { showToast } = useToast();
  const { currentSchool } = useSchool();
  const [formData, setFormData] = useState<FormData>({
    studentIds: [],
    subject: '',
    topic: '',
    timeDuration: '15 minutes',
  });
  const [students, setStudents] = useState<Student[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLesson, setGeneratedLesson] = useState<GeneratedLesson | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentSchool) {
      loadStudents();
    }
  }, [currentSchool]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadStudents() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user && currentSchool) {
      // Build query to fetch students
      let query = supabase
        .from('students')
        .select('id, initials, grade_level, school_id')
        .eq('provider_id', user.id)
        .order('initials');
      
      // Filter by current school if available
      if (currentSchool.school_id) {
        query = query.eq('school_id', currentSchool.school_id);
      }
      
      const { data } = await query;
      
      if (data) {
        setStudents(data);
      }
    }
  }

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleStudentToggle = (studentId: string) => {
    setFormData(prev => ({
      ...prev,
      studentIds: prev.studentIds.includes(studentId)
        ? prev.studentIds.filter(id => id !== studentId)
        : [...prev.studentIds, studentId]
    }));
  };

  const removeStudent = (studentId: string) => {
    setFormData(prev => ({
      ...prev,
      studentIds: prev.studentIds.filter(id => id !== studentId)
    }));
  };

  const getSelectedStudentNames = () => {
    return formData.studentIds
      .map(id => {
        const student = students.find(s => s.id === id);
        return student ? `${student.initials} (Grade ${student.grade_level})` : '';
      })
      .filter(Boolean);
  };

  const handleGenerate = async () => {
    // Validation
    if (formData.studentIds.length === 0) {
      showToast('Please select at least one student', 'error');
      return;
    }

    if (!formData.subject) {
      showToast('Please select a subject', 'error');
      return;
    }

    if (!formData.topic.trim()) {
      showToast('Please enter a topic', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      // Get selected student details
      const selectedStudents = students.filter(s => formData.studentIds.includes(s.id));
      
      // Use the unified lessons API with actual student data
      const response = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: selectedStudents.map(s => ({
            id: s.id,
            grade: s.grade_level
          })),
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
      
      setGeneratedLesson({
        content: data.lesson || data,
        title: data.lesson?.lesson?.title || formData.topic,
        formData,
        lessonId: data.lessonId
      });
      setShowPreview(true);
      showToast('Lesson generated successfully!', 'success');
    } catch (error) {
      console.error('Error generating lesson:', error);
      showToast('Failed to generate lesson. Please try again.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6">AI Lesson Builder</h2>
        
        {/* Student Multi-Select Dropdown */}
        <div className="mb-6" ref={dropdownRef}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Students *
          </label>
          
          {/* Selected Students Tags */}
          {formData.studentIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.studentIds.map(id => {
                const student = students.find(s => s.id === id);
                if (!student) return null;
                return (
                  <span 
                    key={id}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {student.initials} (Grade {student.grade_level})
                    <button
                      type="button"
                      onClick={() => removeStudent(id)}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          
          {/* Dropdown Button */}
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <span className="text-gray-700">
              {formData.studentIds.length === 0 
                ? 'Select students...'
                : `${formData.studentIds.length} student${formData.studentIds.length > 1 ? 's' : ''} selected`
              }
            </span>
            <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute z-10 mt-1 w-full max-w-lg bg-white shadow-lg rounded-md border border-gray-200">
              <div className="max-h-60 overflow-auto py-1">
                {students.length === 0 ? (
                  <div className="px-3 py-2 text-gray-500 text-sm">
                    No students found. Please add students first.
                  </div>
                ) : (
                  students.map(student => (
                    <label 
                      key={student.id}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.studentIds.includes(student.id)}
                        onChange={() => handleStudentToggle(student.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-3 text-sm">
                        {student.initials} (Grade {student.grade_level})
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Subject Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subject *
          </label>
          <select
            value={formData.subject}
            onChange={(e) => handleInputChange('subject', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a subject</option>
            {subjectOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {/* Topic Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Topic *
          </label>
          <input
            type="text"
            value={formData.topic}
            onChange={(e) => handleInputChange('topic', e.target.value)}
            placeholder="e.g., Addition and subtraction, Photosynthesis, Civil War"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Time Duration */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time Duration
          </label>
          <select
            value={formData.timeDuration}
            onChange={(e) => handleInputChange('timeDuration', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {timeDurationOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || students.length === 0}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            isGenerating || students.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating Lesson...
            </span>
          ) : (
            'Generate Lesson'
          )}
        </button>
      </div>

      {/* Preview Modal */}
      {showPreview && generatedLesson && (
        <LessonPreviewModal
          lesson={generatedLesson}
          formData={formData}
          onClose={() => setShowPreview(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
}