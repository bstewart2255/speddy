// app/components/ai-upload/ai-upload-examples.tsx
'use client';

import { X, FileText, FileSpreadsheet, File } from 'lucide-react';

interface AIUploadExamplesProps {
  isOpen: boolean;
  onClose: () => void;
  uploadType: 'students' | 'bell_schedule' | 'special_activities';
}

export default function AIUploadExamples({ isOpen, onClose, uploadType }: AIUploadExamplesProps) {
  if (!isOpen) return null;

  const examples = {
    students: {
      title: 'Student Data Upload Examples',
      formats: [
        {
          icon: <FileSpreadsheet className="h-5 w-5 text-green-500" />,
          name: 'Excel/CSV Format',
          example: `Name,Grade,Teacher,Sessions,Minutes
John Doe,3,Smith,2,30
Jane Smith,K,Johnson,3,20
Mike Wilson,5,Davis,1,45`
        },
        {
          icon: <FileText className="h-5 w-5 text-blue-500" />,
          name: 'Word/PDF Format',
          example: `Class Roster - Ms. Smith - Grade 3
Students:
- John Doe (2 sessions/week, 30 min each)
- Sarah Johnson (3 sessions/week, 30 min)
- Mike Wilson (1 session/week, 45 min)`
        },
        {
          icon: <File className="h-5 w-5 text-purple-500" />,
          name: 'Unstructured Text',
          example: `IEP Meeting Notes:
Student John D. will receive speech services 2x per week for 30 minutes. 
He is in Ms. Smith's 3rd grade class.

Sarah J. (Kindergarten, Ms. Johnson) needs 3 weekly sessions...`
        }
      ]
    },
    bell_schedule: {
      title: 'Bell Schedule Upload Examples',
      formats: [
        {
          icon: <FileSpreadsheet className="h-5 w-5 text-green-500" />,
          name: 'Excel/CSV Format',
          example: `Grade,Period,Start,End
K,Morning Meeting,8:00,8:30
K,Recess,10:00,10:15
1-2,Recess,10:30,10:45
3-5,Lunch,12:00,12:45`
        },
        {
          icon: <FileText className="h-5 w-5 text-blue-500" />,
          name: 'School Schedule Document',
          example: `Elementary Bell Schedule 2024-2025

Kindergarten Schedule:
8:00-8:30 AM - Morning Meeting
10:00-10:15 AM - Recess
12:00-12:30 PM - Lunch

Grades 1-2:
10:30-10:45 AM - Recess
12:30-1:00 PM - Lunch`
        }
      ]
    },
    special_activities: {
      title: 'Special Activities Upload Examples',
      formats: [
        {
          icon: <FileSpreadsheet className="h-5 w-5 text-green-500" />,
          name: 'Excel/CSV Format',
          example: `Teacher,Activity,Day,Start,End
Smith,PE,Monday,10:00,11:00
Johnson,Library,Tuesday,9:00,9:45
Davis,Music,Wednesday,1:00,2:00`
        },
        {
          icon: <FileText className="h-5 w-5 text-blue-500" />,
          name: 'Teacher Schedule Document',
          example: `Special Activities Schedule

Mr. Smith:
- PE: Mondays 10:00-11:00 AM
- PE: Wednesdays 10:00-11:00 AM

Ms. Johnson:
- Library: Tuesdays 9:00-9:45 AM
- Computer Lab: Thursdays 2:00-2:45 PM`
        }
      ]
    }
  };

  const currentExamples = examples[uploadType];

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">{currentExamples.title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            The AI Upload feature can process various file formats. Here are some examples:
          </p>

          {currentExamples.formats.map((format, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                {format.icon}
                <h4 className="font-medium">{format.name}</h4>
              </div>
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                {format.example}
              </pre>
            </div>
          ))}

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Tips for Best Results:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• The AI can handle various formats - don't worry about perfect structure</li>
              <li>• Include clear headers or labels when possible</li>
              <li>• For privacy, the system will automatically convert names to initials</li>
              <li>• Review the parsed data before confirming the import</li>
              <li>• You can uncheck any items you don't want to import</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}