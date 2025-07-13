"use client";

import React from "react";
import { X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Clock, Users, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface Lesson {
  id: string;
  created_at: string;
  time_slot: string;
  student_details: any[];
  content: string;
  lesson_date: string;
  school_site: string;
  notes: string;
}

export default function LessonsPage() {
  const [lessons, setLessons] = React.useState<Lesson[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedLesson, setSelectedLesson] = React.useState<Lesson | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalLessons, setTotalLessons] = React.useState(0);
  const lessonsPerPage = 10;

  const supabase = createClient();

  React.useEffect(() => {
    fetchLessons();
  }, [currentPage]);

  const fetchLessons = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * lessonsPerPage;
      const response = await fetch(`/api/save-lesson?limit=${lessonsPerPage}&offset=${offset}`);

      if (!response.ok) throw new Error('Failed to fetch lessons');

      const data = await response.json();
      setLessons(data.lessons);
      setTotalLessons(data.total);
    } catch (error) {
      console.error("Error fetching lessons:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLessons = lessons.filter(lesson => {
    const searchLower = searchTerm.toLowerCase();
    const studentNames = lesson.student_details.map(s => s.initials.toLowerCase()).join(' ');
    const dateStr = new Date(lesson.lesson_date).toLocaleDateString();

    return (
      studentNames.includes(searchLower) ||
      lesson.time_slot.toLowerCase().includes(searchLower) ||
      dateStr.includes(searchLower) ||
      (lesson.notes && lesson.notes.toLowerCase().includes(searchLower))
    );
  });

  const totalPages = Math.ceil(totalLessons / lessonsPerPage);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading && lessons.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading saved lessons...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/dashboard"
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Saved Lessons</h1>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by student names, date, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Lessons grid or selected lesson */}
      {selectedLesson ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Selected lesson header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Lesson Details</h2>
              <p className="text-sm text-gray-600 mt-1">
                {formatDate(selectedLesson.lesson_date)} • {selectedLesson.time_slot}
              </p>
            </div>
            <button
              onClick={() => setSelectedLesson(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Lesson content */}
          <div className="p-6">
            <div className="mb-4 flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span>
                  {selectedLesson.student_details.map(s => `${s.initials} (Grade ${s.grade_level})`).join(', ')}
                </span>
              </div>
              {selectedLesson.notes && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Notes:</span>
                  <span>{selectedLesson.notes}</span>
                </div>
              )}
            </div>

            <div className="prose max-w-none">
              <div dangerouslySetInnerHTML={{ __html: selectedLesson.content }} />
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
            <button
              onClick={() => setSelectedLesson(null)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Back to List
            </button>
            <button
              onClick={() => {
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                  printWindow.document.write(`
                    <html>
                      <head><title>Lesson - ${selectedLesson.time_slot}</title></head>
                      <body>${selectedLesson.content}</body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.print();
                }
              }}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md transition-colors"
            >
              Print
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Lessons list */}
          {filteredLessons.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500">
                {searchTerm ? 'No lessons found matching your search.' : 'No saved lessons yet.'}
              </p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block text-purple-600 hover:text-purple-700"
              >
                Go to Dashboard →
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedLesson(lesson)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          {formatDate(lesson.lesson_date)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock className="w-4 h-4" />
                          {lesson.time_slot}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium">
                          {lesson.student_details.map(s => `${s.initials} (${s.grade_level})`).join(', ')}
                        </span>
                      </div>

                      {lesson.notes && (
                        <p className="text-sm text-gray-600 italic">
                          Note: {lesson.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-sm text-gray-500">
                      {lesson.school_site}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

                <span className="px-4 py-2 text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}