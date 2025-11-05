import { FileText, FileSpreadsheet, Presentation, FileImage, File } from 'lucide-react';

// Supported document MIME types
export const SUPPORTED_DOCUMENT_TYPES = {
  // PDF
  'application/pdf': ['.pdf'],

  // Microsoft Word
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],

  // Microsoft PowerPoint
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],

  // Microsoft Excel
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],

  // Images
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],

  // Text
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
} as const;

// Maximum file size (25MB)
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Blocked file extensions for security
const BLOCKED_EXTENSIONS = [
  '.exe', '.dll', '.sh', '.bat', '.cmd', '.com', '.scr', '.vbs', '.js', '.msi',
  '.jar', '.app', '.deb', '.rpm', '.apk', '.ps1', '.vb', '.wsf'
];

/**
 * Validate a file for upload
 */
export function validateDocumentFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`
    };
  }

  // Check for blocked extensions
  const extension = getFileExtension(file.name);
  if (BLOCKED_EXTENSIONS.includes(extension.toLowerCase())) {
    return {
      valid: false,
      error: 'This file type is not allowed for security reasons.'
    };
  }

  // Check MIME type
  const allowedTypes = Object.keys(SUPPORTED_DOCUMENT_TYPES);
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Unsupported file type. Please upload a document, image, or text file.'
    };
  }

  return { valid: true };
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.substring(lastDot) : '';
}

/**
 * Get the appropriate icon component for a file type
 */
export function getDocumentIcon(mimeType: string, filename?: string) {
  // Word documents
  if (mimeType.includes('wordprocessing') || mimeType.includes('msword')) {
    return FileText;
  }

  // Excel spreadsheets
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return FileSpreadsheet;
  }

  // PowerPoint presentations
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return Presentation;
  }

  // Images
  if (mimeType.startsWith('image/')) {
    return FileImage;
  }

  // Default file icon
  return File;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

/**
 * Generate a safe filename for storage
 */
export function generateSafeFilename(filename: string): string {
  // Remove any path components
  const basename = filename.split('/').pop() || filename;

  // Replace potentially problematic characters
  return basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255); // Limit length
}

/**
 * Get MIME type from file extension (fallback)
 */
export function getMimeTypeFromExtension(filename: string): string | null {
  const extension = getFileExtension(filename).toLowerCase();

  for (const [mimeType, extensions] of Object.entries(SUPPORTED_DOCUMENT_TYPES)) {
    if (extensions.includes(extension)) {
      return mimeType;
    }
  }

  return null;
}

/**
 * Get a user-friendly file type name
 */
export function getFileTypeName(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word')) return 'Word Document';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel Spreadsheet';
  if (mimeType === 'text/csv') return 'CSV File';
  if (mimeType === 'text/plain') return 'Text File';
  if (mimeType.startsWith('image/')) return 'Image';
  return 'Document';
}
