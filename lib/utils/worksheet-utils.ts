import { WorksheetRenderer } from '../lessons/renderer';
import QRCode from 'qrcode';

/**
 * Generates a unique worksheet ID using crypto.randomUUID or fallback
 */
export function generateWorksheetId(studentId: string, subject?: string): string {
  const timestamp = Date.now();
  const random = typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID().split('-')[0] 
    : Math.random().toString(36).substring(2, 10);
  
  const parts = ['ws', timestamp, random, studentId];
  if (subject) {
    parts.push(subject);
  }
  
  return parts.join('_');
}

/**
 * Generates a QR code for worksheet submission with error handling
 */
export async function generateWorksheetQRCode(worksheetCode: string): Promise<string | null> {
  try {
    const qrUrl = `https://app.speddy.com/ws/${worksheetCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 80,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCodeDataUrl;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    // Return null to allow graceful degradation
    return null;
  }
}

/**
 * Validates student material structure
 */
export function validateStudentMaterial(material: any): boolean {
  if (!material || typeof material !== 'object') {
    return false;
  }
  
  if (!material.worksheet || typeof material.worksheet !== 'object') {
    return false;
  }
  
  const worksheet = material.worksheet;
  if (!worksheet.title || !worksheet.instructions) {
    return false;
  }
  
  // Check for sections or content
  if (!worksheet.sections && !worksheet.content) {
    return false;
  }
  
  return true;
}

/**
 * Finds and validates AI-generated worksheet content for a student
 */
export interface ParsedWorksheetContent {
  studentMaterial: any | null;
  isValid: boolean;
  error?: string;
}

export function findStudentWorksheetContent(
  content: string | null,
  studentId: string
): ParsedWorksheetContent {
  if (!content) {
    return { studentMaterial: null, isValid: false, error: 'No content provided' };
  }
  
  try {
    const parsedContent = JSON.parse(content);
    
    if (!parsedContent.studentMaterials || !Array.isArray(parsedContent.studentMaterials)) {
      return { 
        studentMaterial: null, 
        isValid: false, 
        error: 'No studentMaterials found in content' 
      };
    }
    
    const studentMaterial = parsedContent.studentMaterials.find(
      (m: any) => m.studentId === studentId
    );
    
    if (!studentMaterial) {
      return { 
        studentMaterial: null, 
        isValid: false, 
        error: `No material found for student ${studentId}` 
      };
    }
    
    if (!validateStudentMaterial(studentMaterial)) {
      return { 
        studentMaterial, 
        isValid: false, 
        error: 'Invalid worksheet structure' 
      };
    }
    
    return { studentMaterial, isValid: true };
    
  } catch (parseError) {
    return { 
      studentMaterial: null, 
      isValid: false, 
      error: `Failed to parse content: ${parseError}` 
    };
  }
}

/**
 * Generates HTML worksheet from AI content with error handling
 * Supports subject-specific differentiation if available
 */
export async function generateAIWorksheetHtml(
  studentMaterial: any,
  studentInitials: string,
  worksheetCode: string,
  subject?: 'math' | 'ela'
): Promise<string | null> {
  try {
    // Generate QR code with error handling
    const qrCodeDataUrl = await generateWorksheetQRCode(worksheetCode);
    
    // Check if we have subject-specific content
    let worksheetContent = studentMaterial;
    
    // If subject is specified and we have subject-specific worksheets
    if (subject && studentMaterial.worksheets) {
      // Look for subject-specific worksheet (e.g., worksheets.math or worksheets.ela)
      if (studentMaterial.worksheets[subject]) {
        worksheetContent = {
          ...studentMaterial,
          worksheet: studentMaterial.worksheets[subject]
        };
      } else if (studentMaterial.worksheets.all) {
        // Fall back to general worksheet if available
        worksheetContent = {
          ...studentMaterial,
          worksheet: studentMaterial.worksheets.all
        };
      }
    }
    
    // Use WorksheetRenderer to generate HTML
    const renderer = new WorksheetRenderer();
    const html = renderer.renderStudentWorksheet(
      worksheetContent,
      studentInitials,
      qrCodeDataUrl || undefined // Convert null to undefined for TypeScript
    );
    
    return html;
  } catch (error) {
    console.error('Failed to generate AI worksheet HTML:', error);
    return null;
  }
}

/**
 * Opens and prints HTML worksheet in a new window
 */
export function printHtmlWorksheet(html: string, title: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Failed to open print window - popup blocked');
    return;
  }
  
  printWindow.document.write(html);
  printWindow.document.close();
  
  // Trigger print dialog after content loads
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

/**
 * Opens and prints PDF worksheet with proper print trigger
 */
export function printPdfWorksheet(pdfDataUrl: string, title: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Failed to open print window - popup blocked');
    return;
  }
  
  // Wrap PDF in HTML with auto-print
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { margin: 0; padding: 0; }
          iframe { border: none; width: 100%; height: 100vh; }
        </style>
      </head>
      <body>
        <iframe src="${pdfDataUrl}" onload="setTimeout(() => { window.print(); }, 500);"></iframe>
      </body>
    </html>
  `);
  printWindow.document.close();
}