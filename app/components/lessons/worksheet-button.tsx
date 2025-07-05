// app/components/lessons/worksheet-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Printer, FileText, Loader2 } from 'lucide-react';
import { generateWorksheetWithQR, extractWorksheetFromLesson, generatePrintableWorksheet } from '../../../lib/worksheets/worksheet-generator';

interface WorksheetButtonProps {
  lessonId: string;
  student: {
    id: string;
    initials: string;
    grade_level: string;
  };
  lessonContent: string;
  worksheetType?: string;
}

export function WorksheetButton({ 
  lessonId, 
  student, 
  lessonContent,
  worksheetType = 'practice'
}: WorksheetButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateWorksheet = async () => {
    setIsGenerating(true);

    try {
      // Extract worksheet content based on lesson and student grade
      const worksheetContent = extractWorksheetFromLesson(
        lessonContent, 
        student.id, 
        student.grade_level
      );

      if (!worksheetContent) {
        alert('No worksheet available for this grade level');
        return;
      }

      // Generate worksheet with QR code
      const { worksheetId, qrCodeDataUrl } = await generateWorksheetWithQR(
        lessonId,
        student.id,
        worksheetType,
        worksheetContent
      );

      // Generate printable HTML
      const printableHtml = generatePrintableWorksheet(
        worksheetContent,
        student,
        qrCodeDataUrl
      );

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printableHtml);
        printWindow.document.close();

        // Auto-trigger print dialog after content loads
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error) {
      console.error('Error generating worksheet:', error);
      alert('Failed to generate worksheet. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Determine worksheet type based on grade
  const getWorksheetLabel = () => {
    const gradeLabels: Record<string, string> = {
      'K': 'Letter Recognition',
      '1': 'Phonemic Awareness',
      '2': 'Reading Comprehension',
      '3': 'Multiplication Facts',
      '4': 'Text Analysis',
      '5': 'Fractions Practice'
    };

    return gradeLabels[student.grade_level] || 'Practice';
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleGenerateWorksheet}
      disabled={isGenerating}
      className="flex items-center gap-2"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Printer className="h-4 w-4" />
          Print {getWorksheetLabel()} Worksheet
        </>
      )}
    </Button>
  );
}