/**
 * Renderer for JSON-based lesson content from the new lesson system
 */

import React from 'react';
import { LessonResponse, StudentMaterial, WorksheetContent } from '../lessons/schema';

interface JsonLessonRendererProps {
  lessonData: string | LessonResponse;
  students?: Array<{
    id: string;
    initials: string;
    grade_level?: string;
  }>;
}

type StudentInfo = JsonLessonRendererProps['students'] extends Array<infer S> ? S : never;

export function JsonLessonRenderer({ lessonData, students = [] }: JsonLessonRendererProps) {
  // Parse the lesson data if it's a string and memoize the result to avoid repeat work
  const response = React.useMemo<LessonResponse | null>(() => {
    if (!lessonData) {
      return null;
    }

    if (typeof lessonData === 'string') {
      try {
        return JSON.parse(lessonData) as LessonResponse;
      } catch (error) {
        console.error('Failed to parse lesson data', error);
        return null;
      }
    }

    return lessonData;
  }, [lessonData]);

  const lesson = response?.lesson;
  const studentMaterials = response?.studentMaterials;

  const studentsById = React.useMemo<Record<string, StudentInfo>>(() => {
    return students.reduce<Record<string, StudentInfo>>((acc, student) => {
      if (student?.id) {
        acc[student.id] = student;
      }
      return acc;
    }, {});
  }, [students]);

  const safeStudentMaterials = React.useMemo(() => {
    return Array.isArray(studentMaterials) ? studentMaterials : [];
  }, [studentMaterials]);

  if (!lesson) {
    return <div className="text-gray-500">No lesson content available</div>;
  }

  const renderWorksheetContent = (content: WorksheetContent, index: number) => {
    if (!content) {
      return null;
    }

    return (
      <div key={index} className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-lg">{content.sectionTitle}</h4>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {content.sectionType}
          </span>
        </div>
        {content.instructions && (
          <p className="text-sm text-gray-600 mb-3">{content.instructions}</p>
        )}
        {Array.isArray(content.items) && content.items.length > 0 && (
          <div className="space-y-2">
            {content.items.map((item, idx) => (
              <div key={idx} className="pl-4 border-l-2 border-gray-300">
                <p className="text-sm font-medium">{item.content}</p>
                {item.visualSupport && (
                  <p className="text-xs text-gray-500 italic mt-1">{item.visualSupport}</p>
                )}
                {item.choices && (
                  <ul className="list-disc list-inside text-sm mt-1">
                    {item.choices.map((choice, cIdx) => (
                      <li key={cIdx}>{choice}</li>
                    ))}
                  </ul>
                )}
                {item.blankLines && (
                  <div className="mt-2">
                    {Array.from({ length: item.blankLines }).map((_, lineIdx) => (
                      <div key={lineIdx} className="border-b border-gray-300 h-6 mb-2"></div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStudentMaterial = (material: StudentMaterial, index: number) => {
    const student = material?.studentId ? studentsById[material.studentId] : undefined;

    return (
      <div key={index} className="mb-8 border-l-4 border-blue-500 pl-4">
        <h3 className="text-xl font-bold mb-4 text-blue-700">
          {student?.initials || material.studentName || `Student ${index + 1}`}
          {material.gradeGroup !== undefined && (
            <span className="ml-2 text-sm font-normal">
              (Grade Group {material.gradeGroup})
            </span>
          )}
        </h3>
        
        {/* Worksheet */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h4 className="font-semibold text-lg mb-2">{material.worksheet.title}</h4>
          <p className="text-sm text-gray-600 mb-4">{material.worksheet.instructions}</p>
          
          {/* Worksheet sections */}
          {material.worksheet.sections ? (
            material.worksheet.sections.map((section, sIdx) => (
              <div key={sIdx} className="mb-4">
                <h5 className="font-medium text-md mb-2">{section.title}</h5>
                {section.instructions && (
                  <p className="text-sm text-gray-600 mb-2">{section.instructions}</p>
                )}
                {section.items && section.items.map((item, iIdx) => (
                  <div key={iIdx} className="mb-3">
                    {renderWorksheetContent(item, iIdx)}
                  </div>
                ))}
              </div>
            ))
          ) : material.worksheet.content ? (
            material.worksheet.content.map((content, cIdx) => 
              renderWorksheetContent(content, cIdx)
            )
          ) : null}
          
          {/* Accommodations */}
          {material.worksheet.accommodations && material.worksheet.accommodations.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 rounded">
              <h5 className="font-medium text-sm text-yellow-900 mb-1">Accommodations:</h5>
              <ul className="list-disc list-inside text-sm text-yellow-800">
                {material.worksheet.accommodations.map((acc, aIdx) => (
                  <li key={aIdx}>{acc}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* Lesson Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">{lesson.title}</h2>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>⏱️ {lesson.duration} minutes</span>
          <span>📚 Materials: {lesson.materials}</span>
        </div>
      </div>

      {/* Learning Objectives */}
      {lesson.objectives && lesson.objectives.length > 0 && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg">
          <h3 className="font-semibold text-lg mb-2 text-green-800">Learning Objectives</h3>
          <ul className="list-disc list-inside space-y-1">
            {lesson.objectives.map((obj, idx) => (
              <li key={idx} className="text-sm text-green-700">{obj}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Overview */}
      {lesson.overview && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-lg mb-2 text-blue-800">Lesson Overview</h3>
          <p className="text-sm text-blue-700">{lesson.overview}</p>
        </div>
      )}

      {/* Lesson Structure */}
      <div className="mb-6">
        <h3 className="font-semibold text-lg mb-3">Lesson Structure</h3>
        
        {/* Introduction */}
        {lesson.introduction && (
          <div className="mb-4 p-3 bg-purple-50 rounded">
            <h4 className="font-medium text-purple-800 mb-1">
              Introduction ({lesson.introduction.duration} min)
            </h4>
            <p className="text-sm text-purple-700 mb-2">{lesson.introduction.description}</p>
            {lesson.introduction.instructions && lesson.introduction.instructions.length > 0 && (
              <ul className="list-disc list-inside text-sm text-purple-600">
                {lesson.introduction.instructions.map((inst, idx) => (
                  <li key={idx}>{inst}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Main Activity */}
        {lesson.activity && (
          <div className="mb-4 p-3 bg-blue-50 rounded">
            <h4 className="font-medium text-blue-800 mb-1">
              Main Activity ({lesson.activity.duration} min)
            </h4>
            <p className="text-sm text-blue-700 mb-2">{lesson.activity.description}</p>
            {lesson.activity.instructions && lesson.activity.instructions.length > 0 && (
              <ul className="list-disc list-inside text-sm text-blue-600">
                {lesson.activity.instructions.map((inst, idx) => (
                  <li key={idx}>{inst}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Closure */}
        {lesson.closure && (
          <div className="mb-4 p-3 bg-green-50 rounded">
            <h4 className="font-medium text-green-800 mb-1">
              Closure ({lesson.closure.duration} min)
            </h4>
            <p className="text-sm text-green-700 mb-2">{lesson.closure.description}</p>
            {lesson.closure.instructions && lesson.closure.instructions.length > 0 && (
              <ul className="list-disc list-inside text-sm text-green-600">
                {lesson.closure.instructions.map((inst, idx) => (
                  <li key={idx}>{inst}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Differentiation Strategies */}
      {lesson.differentiation && (
        <div className="mb-6 p-4 bg-amber-50 rounded-lg">
          <h3 className="font-semibold text-lg mb-2 text-amber-800">Differentiation Strategies</h3>
          <div className="space-y-2">
            {lesson.differentiation.below && (
              <div>
                <span className="font-medium text-sm text-amber-700">Below Grade Level:</span>
                <p className="text-sm text-amber-600 ml-4">{lesson.differentiation.below}</p>
              </div>
            )}
            {lesson.differentiation.onLevel && (
              <div>
                <span className="font-medium text-sm text-amber-700">On Grade Level:</span>
                <p className="text-sm text-amber-600 ml-4">{lesson.differentiation.onLevel}</p>
              </div>
            )}
            {lesson.differentiation.above && (
              <div>
                <span className="font-medium text-sm text-amber-700">Above Grade Level:</span>
                <p className="text-sm text-amber-600 ml-4">{lesson.differentiation.above}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Student Materials */}
      {safeStudentMaterials.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-xl mb-4">Student Materials</h3>
          {safeStudentMaterials.map((material, idx) => renderStudentMaterial(material, idx))}
        </div>
      )}
    </div>
  );
}