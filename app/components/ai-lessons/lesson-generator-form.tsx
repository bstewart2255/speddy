'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Student {
  id: string;
  initials: string;
  grade_level: string;
}

export function LessonGeneratorForm() {
  const [loading, setLoading] = useState(false);
  const [lessonType, setLessonType] = useState<'individual' | 'group'>('individual');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [subject, setSubject] = useState('reading');
  const [duration, setDuration] = useState(30);
  const [focusSkills, setFocusSkills] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [generatedLesson, setGeneratedLesson] = useState<any>(null);
  const [error, setError] = useState('');

  // Load students on component mount
  useState(() => {
    loadStudents();
  });

  async function loadStudents() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data } = await supabase
        .from('students')
        .select('id, initials, grade_level')
        .eq('provider_id', user.id)
        .order('initials');
      
      if (data) {
        setStudents(data);
      }
    }
  }

  async function generateLesson() {
    if (selectedStudents.length === 0) {
      setError('Please select at least one student');
      return;
    }

    if (lessonType === 'group' && (selectedStudents.length < 2 || selectedStudents.length > 6)) {
      setError('Group lessons require 2-6 students');
      return;
    }

    setLoading(true);
    setError('');
    setGeneratedLesson(null);

    try {
      const response = await fetch('/api/ai-lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: selectedStudents,
          lessonType,
          subject,
          duration,
          focusSkills: focusSkills ? focusSkills.split(',').map(s => s.trim()) : undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate lesson');
      }

      setGeneratedLesson(data.lesson);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleStudent(studentId: string) {
    setSelectedStudents(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId);
      }
      return [...prev, studentId];
    });
  }

  function downloadWorksheet(worksheetData: any) {
    // Create a printable HTML document
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${worksheetData.title || 'Worksheet'}</title>
        <style>
          @page { size: letter; margin: 0.5in; }
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .header { text-align: center; margin-bottom: 20px; }
          .qr-code { width: 100px; height: 100px; float: right; }
          .student-info { margin-bottom: 20px; }
          .instructions { background: #f0f0f0; padding: 10px; margin: 15px 0; }
          .problem { margin: 15px 0; page-break-inside: avoid; }
          .visual-support { border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="qr-code">
          <img src="${worksheetData.qrCode}" alt="QR Code" />
        </div>
        <div class="header">
          <h1>${generatedLesson.title}</h1>
          <div class="student-info">
            Name: _________________ Date: _________________
          </div>
        </div>
        <div class="content">
          <!-- Worksheet content would be rendered here -->
          <p>Complete worksheet materials included...</p>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worksheet-${worksheetData.worksheetId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">AI Lesson Generator 2.0</h2>
      
      {/* Lesson Configuration */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Lesson Configuration</h3>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Lesson Type</label>
            <select
              value={lessonType}
              onChange={(e) => setLessonType(e.target.value as 'individual' | 'group')}
              className="w-full p-2 border rounded"
            >
              <option value="individual">Individual</option>
              <option value="group">Group (2-6 students)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="reading">Reading</option>
              <option value="math">Math</option>
              <option value="writing">Writing</option>
              <option value="spelling">Spelling</option>
              <option value="phonics">Phonics</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min="15"
              max="60"
              step="5"
              className="w-full p-2 border rounded"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              Focus Skills (optional, comma-separated)
            </label>
            <input
              type="text"
              value={focusSkills}
              onChange={(e) => setFocusSkills(e.target.value)}
              placeholder="e.g., phonemic awareness, addition"
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
      </div>

      {/* Student Selection */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">
          Select Students ({selectedStudents.length} selected)
        </h3>
        
        <div className="grid grid-cols-3 gap-3">
          {students.map(student => (
            <label
              key={student.id}
              className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${
                selectedStudents.includes(student.id)
                  ? 'bg-blue-50 border-blue-500'
                  : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedStudents.includes(student.id)}
                onChange={() => toggleStudent(student.id)}
                className="mr-2"
              />
              <div>
                <div className="font-medium">{student.initials}</div>
                <div className="text-sm text-gray-500">Grade {student.grade_level}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex justify-center mb-6">
        <button
          onClick={generateLesson}
          disabled={loading || selectedStudents.length === 0}
          className={`px-8 py-3 rounded-lg font-medium transition-colors ${
            loading || selectedStudents.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading ? 'Generating...' : 'Generate Lesson'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Generated Lesson Display */}
      {generatedLesson && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold">{generatedLesson.title}</h3>
              <p className="text-gray-600">
                {generatedLesson.type} lesson • {generatedLesson.duration} minutes
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Data Confidence</div>
              <div className="text-lg font-medium">
                {Math.round(generatedLesson.dataConfidence * 100)}%
              </div>
            </div>
          </div>

          {/* Objectives */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Learning Objectives:</h4>
            <ul className="list-disc list-inside text-gray-700">
              {generatedLesson.objectives.map((obj: string, i: number) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
          </div>

          {/* Materials */}
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
            <span className="font-medium">Materials: </span>
            <span className="text-green-700">{generatedLesson.materials}</span>
          </div>

          {/* Worksheets */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Student Worksheets:</h4>
            <div className="space-y-2">
              {generatedLesson.worksheets.map((ws: any) => {
                const student = students.find(s => s.id === ws.studentId);
                return (
                  <div key={ws.worksheetId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                      <span className="font-medium">{student?.initials}</span>
                      <span className="text-sm text-gray-500 ml-2">
                        Worksheet ID: {ws.worksheetId}
                      </span>
                    </div>
                    <button
                      onClick={() => downloadWorksheet(ws)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Download PDF
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Teacher Guidance */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Teacher Guidance:</h4>
            <div className="text-sm text-gray-700 space-y-2">
              <p>{generatedLesson.teacherGuidance.overview}</p>
              
              {generatedLesson.teacherGuidance.checkInPriorities.length > 0 && (
                <div>
                  <span className="font-medium">Check-in Priorities: </span>
                  {generatedLesson.teacherGuidance.checkInPriorities.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}