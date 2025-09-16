import { WorksheetRenderer } from '../lessons/renderer';
// QR CODE DISABLED: Commenting out QR code functionality to simplify pipeline (Issue #268)
// import QRCode from 'qrcode';

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
 * QR CODE DISABLED: Commenting out QR code functionality to simplify pipeline (Issue #268)
 */
export async function generateWorksheetQRCode(worksheetCode: string): Promise<string | null> {
  // QR CODE DISABLED: Returning null immediately to skip QR generation
  console.log('[QR DISABLED] Skipping QR code generation for worksheet:', worksheetCode);
  return null;

  /* ORIGINAL CODE - PRESERVED FOR FUTURE REFERENCE
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
  */
}

/**
 * Validates student material structure
 * Supports both material.worksheet and material.worksheets.{math|ela|all}
 */
export function validateStudentMaterial(material: any): boolean {
  if (!material || typeof material !== 'object') {
    console.error('[VALIDATION ERROR] Material is not an object:', material);
    return false;
  }

  // Find the worksheet to validate
  let worksheet: any = null;

  // Prefer material.worksheet if present
  if (material.worksheet && typeof material.worksheet === 'object') {
    worksheet = material.worksheet;
    console.log('[VALIDATION] Found worksheet at material.worksheet');
  }
  // Otherwise check for material.worksheets with math, ela, or all keys
  else if (material.worksheets && typeof material.worksheets === 'object') {
    // Check for any valid worksheet in worksheets object
    if (material.worksheets.math && typeof material.worksheets.math === 'object') {
      worksheet = material.worksheets.math;
      console.log('[VALIDATION] Found worksheet at material.worksheets.math');
    } else if (material.worksheets.ela && typeof material.worksheets.ela === 'object') {
      worksheet = material.worksheets.ela;
      console.log('[VALIDATION] Found worksheet at material.worksheets.ela');
    } else if (material.worksheets.all && typeof material.worksheets.all === 'object') {
      worksheet = material.worksheets.all;
      console.log('[VALIDATION] Found worksheet at material.worksheets.all');
    }
  }

  // If no worksheet found in either location, return false
  if (!worksheet) {
    console.error('[VALIDATION ERROR] No worksheet found in material structure:', {
      hasWorksheet: !!material.worksheet,
      hasWorksheets: !!material.worksheets,
      worksheetKeys: material.worksheets ? Object.keys(material.worksheets) : []
    });
    return false;
  }

  // Validate the worksheet structure
  if (!worksheet.title || !worksheet.instructions) {
    console.error('[VALIDATION ERROR] Missing required fields:', {
      hasTitle: !!worksheet.title,
      hasInstructions: !!worksheet.instructions,
      title: worksheet.title,
      instructions: worksheet.instructions
    });
    return false;
  }

  // Check for sections or content
  if (!worksheet.sections && !worksheet.content) {
    console.error('[VALIDATION ERROR] No sections or content found in worksheet');
    return false;
  }

  // Validate that content actually exists in sections or content
  if (worksheet.sections) {
    const hasValidContent = worksheet.sections.some((section: any) =>
      section.items && section.items.length > 0
    );
    if (!hasValidContent) {
      console.warn('[VALIDATION WARNING] Sections exist but have no items');
    }
  }

  if (worksheet.content) {
    const hasValidContent = worksheet.content.length > 0 &&
      worksheet.content.some((c: any) => c.items && c.items.length > 0);
    if (!hasValidContent) {
      console.warn('[VALIDATION WARNING] Content exists but has no items');
    }
  }

  console.log('[VALIDATION] Worksheet validation passed');
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
  console.log('[DEBUG] generateAIWorksheetHtml called with:', {
    studentInitials,
    subject,
    worksheetCode,
    hasStudentMaterial: !!studentMaterial
  });

  try {
    // QR CODE DISABLED: Skipping QR code generation to simplify pipeline (Issue #268)
    // const qrCodeDataUrl = await generateWorksheetQRCode(worksheetCode);
    const qrCodeDataUrl = null; // QR codes temporarily disabled

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
    console.log('[DEBUG] Calling WorksheetRenderer.renderStudentWorksheet');

    const html = renderer.renderStudentWorksheet(
      worksheetContent,
      studentInitials,
      qrCodeDataUrl || undefined // Convert null to undefined for TypeScript
    );

    console.log('[DEBUG] WorksheetRenderer returned HTML with length:', html?.length || 0);

    return html;
  } catch (error) {
    console.error('Failed to generate AI worksheet HTML:', error);
    return null;
  }
}

/**
 * Opens and prints HTML worksheet using iframe (avoids pop-up blockers)
 */
export function printHtmlWorksheet(html: string | null, title: string): void {
  console.log('[DEBUG] printHtmlWorksheet called with:', { title, htmlLength: html?.length || 0 });

  // Validate HTML content before attempting to print
  if (!html || html.trim().length === 0) {
    console.error(`Cannot print empty worksheet for: ${title}`);
    // Show user-friendly error message
    // TODO: Replace with toast notification when available in calling components
    const errorMessage = `Unable to generate worksheet content for ${title}. Please try again or contact support if the issue persists.`;
    alert(errorMessage);
    return;
  }

  console.log('[DEBUG] Creating iframe for worksheet print:', title);

  // Create a hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  
  // Add iframe to document
  document.body.appendChild(iframe);
  
  try {
    // Write content to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Unable to access iframe document');
    }
    
    iframeDoc.write(html);
    iframeDoc.close();
    
    // Wait for content to load then print
    const printAndCleanup = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (printError) {
        console.error('Failed to trigger print dialog:', printError);
      } finally {
        // Remove iframe after a delay to ensure print dialog has opened
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      }
    };
    
    // Check if content is loaded
    if (iframe.contentWindow?.document.readyState === 'complete') {
      printAndCleanup();
    } else {
      iframe.onload = printAndCleanup;
      // Fallback timeout
      setTimeout(printAndCleanup, 1500);
    }
  } catch (error) {
    console.error('Failed to prepare worksheet for printing:', error);
    // Clean up iframe on error
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
    // TODO: Replace with toast notification when available in calling components
    alert(`Unable to prepare worksheet for printing (${title}). Please try again or contact support if the issue persists.`);
  }
}

/**
 * Downloads a worksheet as HTML file
 */
export function downloadHtmlWorksheet(html: string | null, title: string): void {
  if (!html || html.trim().length === 0) {
    console.error(`Cannot download empty worksheet for: ${title}`);
    alert(`Unable to generate worksheet content for ${title}. Please try again.`);
    return;
  }
  
  // Create blob and download link
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads a worksheet as PDF file
 */
export function downloadPdfWorksheet(pdfDataUrl: string, title: string): void {
  // Convert data URL to blob if needed
  const link = document.createElement('a');
  link.href = pdfDataUrl;
  link.download = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Opens and prints PDF worksheet using iframe (avoids pop-up blockers)
 */
export function printPdfWorksheet(pdfDataUrl: string, title: string): void {
  const escapeHtml = (s: string) =>
    String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  
  const safeTitle = escapeHtml(title);
  const safeSrc = escapeHtml(pdfDataUrl);
  
  // Create a hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  
  // Add iframe to document
  document.body.appendChild(iframe);
  
  try {
    // Write PDF wrapper HTML to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Unable to access iframe document');
    }
    
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTitle}</title>
          <style>
            body { margin: 0; padding: 0; }
            embed { width: 100%; height: 100vh; }
          </style>
        </head>
        <body>
          <embed src="${safeSrc}" type="application/pdf" />
        </body>
      </html>
    `);
    iframeDoc.close();
    
    // Wait for PDF to load then print
    const printAndCleanup = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (printError) {
        console.error('Failed to trigger print dialog for PDF:', printError);
      } finally {
        // Remove iframe after a delay to ensure print dialog has opened
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      }
    };
    
    // Give PDF time to load, then print
    setTimeout(printAndCleanup, 1000);
  } catch (error) {
    console.error('Failed to prepare PDF for printing:', error);
    // Clean up iframe on error
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
    alert(`Unable to prepare PDF for printing (${title}). Please try again.`);
  }
}