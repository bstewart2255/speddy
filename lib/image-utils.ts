/**
 * Image optimization utilities for worksheet uploads
 */

/**
 * Compress an image file to reduce size while maintaining quality
 * @param file - The image file to compress
 * @param maxSizeMB - Maximum size in megabytes (default: 2MB)
 * @returns Compressed image as Blob
 */
export async function compressImage(file: File, maxSizeMB: number = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    // If file is already under the limit, return it as-is
    if (file.size <= maxSizeBytes && file.type === 'image/jpeg') {
      resolve(file);
      return;
    }

    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    img.onload = async () => {
      try {
        // Calculate new dimensions (max 2000px on longest side)
        const maxDimension = 2000;
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (maxDimension / width) * height;
            width = maxDimension;
          } else {
            width = (maxDimension / height) * width;
            height = maxDimension;
          }
        }

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Try different quality levels to achieve target size
        let quality = 0.8;
        let blob: Blob | null = null;

        while (quality >= 0.1) {
          blob = await new Promise<Blob | null>((resolveBlob) => {
            canvas.toBlob(
              (b) => resolveBlob(b),
              'image/jpeg',
              quality
            );
          });

          if (!blob) {
            throw new Error('Failed to create blob');
          }

          // If blob is under target size or quality is too low, accept it
          if (blob.size <= maxSizeBytes || quality <= 0.3) {
            break;
          }

          // Reduce quality for next iteration
          quality -= 0.1;
        }

        if (!blob) {
          throw new Error('Failed to compress image');
        }

        resolve(blob);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Load the image
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Validate an image file before upload
 * @param file - The file to validate
 * @returns Object with validation result and error message if invalid
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check if file exists
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type.toLowerCase())) {
    return { 
      valid: false, 
      error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' 
    };
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  if (file.size > maxSize) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return { 
      valid: false, 
      error: `File too large (${sizeMB}MB). Maximum size is 10MB.` 
    };
  }

  // Check for suspicious file names
  const fileName = file.name.toLowerCase();
  const suspiciousExtensions = ['.exe', '.dll', '.sh', '.bat', '.cmd'];
  if (suspiciousExtensions.some(ext => fileName.includes(ext))) {
    return { 
      valid: false, 
      error: 'Invalid file type detected.' 
    };
  }

  return { valid: true };
}

/**
 * Extract metadata from an image file
 * @param file - The image file to analyze
 * @returns Promise with image dimensions and file size
 */
export async function extractImageMetadata(
  file: File
): Promise<{ width: number; height: number; size: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
        size: file.size
      });
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for metadata extraction'));
    };

    // Create object URL for the image
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    // Clean up object URL after loading
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: img.width,
        height: img.height,
        size: file.size
      });
    };
  });
}

/**
 * Server-side image validation for Node.js environment
 * @param buffer - Image buffer
 * @param fileName - Original file name
 * @param fileSize - File size in bytes
 * @returns Validation result
 */
export function validateImageBuffer(
  buffer: Buffer,
  fileName: string,
  fileSize: number
): { valid: boolean; error?: string } {
  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  if (fileSize > maxSize) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    return { 
      valid: false, 
      error: `File too large (${sizeMB}MB). Maximum size is 10MB.` 
    };
  }

  // Check file extension
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  if (!validExtensions.includes(fileExtension)) {
    return { 
      valid: false, 
      error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' 
    };
  }

  // Basic magic number validation for common image formats
  const magicNumbers = {
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    webp: [0x52, 0x49, 0x46, 0x46] // RIFF header
  };

  const fileHeader = buffer.slice(0, 4);
  
  let isValidFormat = false;
  
  // Check JPEG
  if (fileHeader[0] === magicNumbers.jpeg[0] && 
      fileHeader[1] === magicNumbers.jpeg[1] && 
      fileHeader[2] === magicNumbers.jpeg[2]) {
    isValidFormat = true;
  }
  
  // Check PNG
  else if (fileHeader[0] === magicNumbers.png[0] && 
           fileHeader[1] === magicNumbers.png[1] && 
           fileHeader[2] === magicNumbers.png[2] && 
           fileHeader[3] === magicNumbers.png[3]) {
    isValidFormat = true;
  }
  
  // Check WebP (has RIFF header)
  else if (fileHeader[0] === magicNumbers.webp[0] && 
           fileHeader[1] === magicNumbers.webp[1] && 
           fileHeader[2] === magicNumbers.webp[2] && 
           fileHeader[3] === magicNumbers.webp[3]) {
    // Additional check for WebP signature at offset 8
    if (buffer.length > 12) {
      const webpSignature = buffer.slice(8, 12).toString('ascii');
      if (webpSignature === 'WEBP') {
        isValidFormat = true;
      }
    }
  }

  if (!isValidFormat) {
    return { 
      valid: false, 
      error: 'File content does not match image format. Please upload a valid image file.' 
    };
  }

  return { valid: true };
}

/**
 * Convert a File to Buffer (for Node.js compatibility in API routes)
 * @param file - File to convert
 * @returns Promise with Buffer
 */
export async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Format file size for display
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}