const Jimp = require('jimp');
const QrCode = require('qrcode-reader');

interface QRExtractionResult {
  content: string | null;
  worksheetCode: string | null;
}

/**
 * Verify that an uploaded image contains the expected QR code
 * @param imageBuffer - The image buffer to verify
 * @param expectedCode - The expected worksheet code
 * @returns True if the QR code matches, false otherwise
 */
export async function verifyQRCodeMatch(
  imageBuffer: Buffer,
  expectedCode: string
): Promise<boolean> {
  try {
    const result = await extractQRCodeContent(imageBuffer);
    
    if (!result.content || !result.worksheetCode) {
      return false;
    }

    // Compare the extracted worksheet code with the expected code
    return result.worksheetCode === expectedCode;
  } catch (error) {
    console.error('Error verifying QR code:', error);
    return false;
  }
}

/**
 * Extract QR code content from an image and parse the worksheet code
 * Supports both old (JSON/raw) and new (URL) formats
 * @param imageBuffer - The image buffer to process
 * @returns Object containing the full QR content and extracted worksheet code
 */
export async function extractQRCodeContent(
  imageBuffer: Buffer
): Promise<QRExtractionResult> {
  try {
    const image = await Jimp.read(imageBuffer);
    const qr = new QrCode();

    return new Promise((resolve) => {
      qr.callback = (err: any, value: any) => {
        if (err || !value || !value.result) {
          console.error('QR decode error:', err);
          resolve({ content: null, worksheetCode: null });
          return;
        }

        const content = value.result;
        const worksheetCode = parseWorksheetCode(content);
        
        resolve({
          content,
          worksheetCode
        });
      };
      
      qr.decode(image.bitmap);
    });
  } catch (error) {
    console.error('QR extraction error:', error);
    return { content: null, worksheetCode: null };
  }
}

/**
 * Parse worksheet code from various QR code formats
 * @param qrContent - The raw QR code content
 * @returns The extracted worksheet code or null
 */
export function parseWorksheetCode(qrContent: string): string | null {
  if (!qrContent) return null;

  try {
    // Format 1: New URL format - https://app.speddy.com/ws/WS-12345
    const urlMatch = qrContent.match(/https?:\/\/[^\/]+\/ws\/([A-Za-z0-9\-_]+)/);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }

    // Format 2: Old JSON format
    try {
      const jsonData = JSON.parse(qrContent);
      // Check for 'ws' field (worksheet ID)
      if (jsonData.ws) {
        return jsonData.ws;
      }
      // Check for 'worksheetId' field
      if (jsonData.worksheetId) {
        return jsonData.worksheetId;
      }
      // Check for 'id' field
      if (jsonData.id) {
        return jsonData.id;
      }
    } catch (jsonError) {
      // Not JSON, continue to other formats
    }

    // Format 3: Raw worksheet code (e.g., "WS-12345")
    if (qrContent.match(/^WS-[A-Za-z0-9\-_]+$/)) {
      return qrContent;
    }

    // Format 4: Check if the entire content looks like a worksheet code pattern
    // This is more lenient to catch variations
    const codeMatch = qrContent.match(/WS-[A-Za-z0-9\-_]+/);
    if (codeMatch) {
      return codeMatch[0];
    }

    return null;
  } catch (error) {
    console.error('Error parsing worksheet code:', error);
    return null;
  }
}

/**
 * Enhanced QR extraction for submit-worksheet route
 * Returns both the full content and parsed worksheet code
 */
export async function extractQRCodeForSubmission(
  imageBuffer: Buffer
): Promise<{ content: string | null; code: string | null }> {
  const result = await extractQRCodeContent(imageBuffer);
  return {
    content: result.content,
    code: result.worksheetCode
  };
}