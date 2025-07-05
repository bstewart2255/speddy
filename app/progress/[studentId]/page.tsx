// app/progress/[studentId]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { StudentProgressDashboard } from '../../components/progress/student-progress-dashboard';
import { ArrowLeft } from 'lucide-react';

export default function StudentProgressPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Students
        </button>

        <StudentProgressDashboard studentId={studentId} />
      </div>
    </div>
  );
}