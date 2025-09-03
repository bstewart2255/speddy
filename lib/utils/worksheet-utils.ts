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
 * Supports both material.worksheet and material.worksheets.{math|ela|all}
 */
export function validateStudentMaterial(material: any): boolean {
  if (!material || typeof material !== 'object') {
    console.log('Validation failed: material is not an object');
    return false;
  }
  
  // Find the worksheet to validate
  let worksheet: any = null;
  
  // Prefer material.worksheet if present
  if (material.worksheet && typeof material.worksheet === 'object') {
    worksheet = material.worksheet;
  } 
  // Otherwise check for material.worksheets with math, ela, or all keys
  else if (material.worksheets && typeof material.worksheets === 'object') {
    // Check for any valid worksheet in worksheets object
    if (material.worksheets.math && typeof material.worksheets.math === 'object') {
      worksheet = material.worksheets.math;
    } else if (material.worksheets.ela && typeof material.worksheets.ela === 'object') {
      worksheet = material.worksheets.ela;
    } else if (material.worksheets.all && typeof material.worksheets.all === 'object') {
      worksheet = material.worksheets.all;
    }
  }
  
  // If no worksheet found in either location, return false
  if (!worksheet) {
    console.log('Validation failed: no worksheet found in material');
    return false;
  }
  
  // Validate the worksheet structure
  if (!worksheet.title || !worksheet.instructions) {
    console.log('Validation failed: missing title or instructions', {
      hasTitle: !!worksheet.title,
      hasInstructions: !!worksheet.instructions
    });
    return false;
  }
  
  // Check for sections or content
  if (!worksheet.sections && !worksheet.content) {
    console.log('Validation failed: no sections or content found');
    return false;
  }
  
  // Validate that content actually exists in sections or content
  if (worksheet.sections) {
    const hasValidContent = worksheet.sections.some((section: any) => 
      section.items && section.items.length > 0
    );
    if (!hasValidContent) {
      console.warn('Validation warning: sections exist but have no items');
    }
  }
  
  if (worksheet.content) {
    const hasValidContent = worksheet.content.length > 0 && 
      worksheet.content.some((c: any) => c.items && c.items.length > 0);
    if (!hasValidContent) {
      console.warn('Validation warning: content exists but has no items');
    }
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
    
    // Prepare worksheet content with proper structure
    let worksheetContent = studentMaterial;
    
    // Handle different data structures
    // 1. Check if we already have a worksheet property
    if (studentMaterial.worksheet) {
      // Already in correct format, use as-is
      worksheetContent = studentMaterial;
    }
    // 2. Check if we have subject-specific worksheets
    else if (subject && studentMaterial.worksheets) {
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
      } else {
        // No matching worksheet found
        console.error(`No ${subject} worksheet found for student`);
        return null;
      }
    }
    // 3. Check if we have general worksheets without subject specified
    else if (studentMaterial.worksheets) {
      // Try to find any available worksheet
      const availableWorksheet = studentMaterial.worksheets.math || 
                                 studentMaterial.worksheets.ela || 
                                 studentMaterial.worksheets.all;
      if (availableWorksheet) {
        worksheetContent = {
          ...studentMaterial,
          worksheet: availableWorksheet
        };
      } else {
        console.error('No worksheets found in studentMaterial.worksheets');
        return null;
      }
    }
    else {
      console.error('No worksheet or worksheets property found in studentMaterial');
      return null;
    }
    
    // Validate that we have a worksheet before rendering
    if (!worksheetContent.worksheet) {
      console.error('Failed to extract worksheet from studentMaterial');
      return null;
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
export function printHtmlWorksheet(html: string | null, title: string): void {
  // Validate HTML content before attempting to print
  if (!html || html.trim().length === 0) {
    console.error(`Cannot print empty worksheet for: ${title}`);
    // Show user-friendly error message
    const errorMessage = `Failed to generate worksheet for ${title}. The worksheet content could not be created.`;
    alert(errorMessage);
    return;
  }
  
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    console.error('Failed to open print window - popup blocked');
    alert('Please allow pop-ups for this site to print worksheets. Check your browser settings and try again.');
    return;
  }
  
  try {
    // Write content to the print window
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Wait for content to load before triggering print
    printWindow.onload = () => {
      setTimeout(() => {
        try {
          printWindow.print();
        } catch (printError) {
          console.error('Failed to trigger print dialog:', printError);
        }
      }, 500);
    };
    
    // Fallback if onload doesn't fire
    setTimeout(() => {
      if (printWindow && !printWindow.closed) {
        try {
          printWindow.print();
        } catch (printError) {
          console.error('Failed to trigger print dialog (fallback):', printError);
        }
      }
    }, 1000);
  } catch (error) {
    console.error('Failed to write content to print window:', error);
    alert(`Failed to prepare worksheet for printing: ${title}`);
    if (printWindow && !printWindow.closed) {
      printWindow.close();
    }
  }
}

/**
 * Opens and prints PDF worksheet with proper print trigger
 */
export function printPdfWorksheet(pdfDataUrl: string, title: string): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    console.error('Failed to open print window - popup blocked');
    return;
  }
  
  const escapeHtml = (s: string) =>
    String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  
  const safeTitle = escapeHtml(title);
  const safeSrc = escapeHtml(pdfDataUrl);
  
  // Wrap PDF in HTML with auto-print
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${safeTitle}</title>
        <style>
          body { margin: 0; padding: 0; }
          iframe { border: none; width: 100%; height: 100vh; }
        </style>
      </head>
      <body>
        <iframe src="${safeSrc}" onload="setTimeout(() => { window.print(); }, 500);"></iframe>
      </body>
    </html>
  `);
  printWindow.document.close();
}