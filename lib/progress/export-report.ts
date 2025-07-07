import { jsPDF } from 'jspdf';

interface ExportData {
  student: {
    initials: string;
    grade_level: string;
  };
  iepGoals: Array<{
    goal: string;
    target: number;
    current: number;
    trend: string;
  }>;
  overallProgress: {
    averageAccuracy: number;
    totalWorksheets: number;
    strongestSkill: string | null;
    needsWork: string | null;
  };
  dateRange: string;
}

export function exportProgressReport(data: ExportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.text('Student Progress Report', pageWidth / 2, 20, { align: 'center' });

  // Student Info
  doc.setFontSize(12);
  doc.text(`Student: ${data.student.initials}`, 20, 40);
  doc.text(`Grade: ${data.student.grade_level}`, 20, 50);
  doc.text(`Report Period: ${data.dateRange}`, 20, 60);

  // Overall Progress
  doc.setFontSize(14);
  doc.text('Overall Performance', 20, 80);
  doc.setFontSize(11);
  doc.text(`Average Accuracy: ${data.overallProgress.averageAccuracy.toFixed(1)}%`, 30, 90);
  doc.text(`Worksheets Completed: ${data.overallProgress.totalWorksheets}`, 30, 100);
  if (data.overallProgress.strongestSkill) {
    doc.text(`Strongest Area: ${data.overallProgress.strongestSkill}`, 30, 110);
  }
  if (data.overallProgress.needsWork) {
    doc.text(`Needs Practice: ${data.overallProgress.needsWork}`, 30, 120);
  }

  // IEP Goals
  if (data.iepGoals.length > 0) {
    doc.setFontSize(14);
    doc.text('IEP Goal Progress', 20, 140);
    doc.setFontSize(10);

    let yPos = 150;
    data.iepGoals.forEach((goal, index) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(`${index + 1}. ${goal.goal.substring(0, 60)}...`, 30, yPos);
      doc.text(`Progress: ${goal.current}% / ${goal.target}% (${goal.trend})`, 40, yPos + 8);
      yPos += 20;
    });
  }

  // Footer
  doc.setFontSize(9);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 20, 280);

  // Save the PDF
  doc.save(`progress-report-${data.student.initials}-${new Date().toISOString().split('T')[0]}.pdf`);
}