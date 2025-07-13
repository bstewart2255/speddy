// app/api/email-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

const resend = new Resend(process.env['RESEND_API_KEY']);

// This endpoint receives forwarded emails from Resend
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Log for debugging
    console.log('Received email webhook:', {
      from: payload.from,
      subject: payload.subject,
      attachments: payload.attachments?.length || 0
    });

    // Extract email data
    const { from, subject, html, text, attachments } = payload;

    // Check if this is a worksheet submission
    if (!subject?.toLowerCase().includes('worksheet') && !text?.toLowerCase().includes('worksheet')) {
      return NextResponse.json({ 
        message: 'Not a worksheet submission, ignoring' 
      }, { status: 200 });
    }

    // Process attachments (images)
    if (!attachments || attachments.length === 0) {
      // Send error email back
      await resend.emails.send({
        from: 'IEP Progress <progress@speddy.xyz>',
        to: from,
        subject: 'No image attached - Please resend',
        html: `
          <p>We didn't receive any image attachment with your worksheet submission.</p>
          <p>Please make sure to:</p>
          <ol>
            <li>Take a clear photo of the completed worksheet</li>
            <li>Attach the image to your email</li>
            <li>Send to progress@yourapp.com</li>
          </ol>
        `
      });

      return NextResponse.json({ 
        error: 'No attachments found' 
      }, { status: 400 });
    }

    const supabase = await createClient();

    // Process each image attachment
    for (const attachment of attachments) {
      if (!attachment.content_type?.startsWith('image/')) {
        continue; // Skip non-image attachments
      }

      try {
        // Decode base64 image
        const imageBuffer = Buffer.from(attachment.content, 'base64');

        // Extract QR code from image
        const qrCode = await extractQRCode(imageBuffer);

        if (!qrCode) {
          await sendErrorEmail(from, 'Could not read QR code from image');
          continue;
        }

        // Process the worksheet submission
        const result = await processWorksheetSubmission(
          supabase,
          qrCode,
          imageBuffer,
          from
        );

        // Send success confirmation
        if (result.success) {
          await resend.emails.send({
            from: 'IEP Progress <progress@speddy.xyz>',
            to: from,
            subject: 'Worksheet processed successfully!',
            html: `
              <h2>Worksheet Received!</h2>
              <p>We've successfully processed the worksheet for <strong>${result.studentInitials}</strong>.</p>
              <p><strong>Accuracy:</strong> ${result.accuracy}%</p>
              <p><strong>Worksheet Type:</strong> ${result.worksheetType}</p>
              ${result.feedback ? `<p><strong>Feedback:</strong> ${result.feedback}</p>` : ''}
              <p>You can view detailed progress in your dashboard.</p>
            `
          });
        }
      } catch (error) {
        console.error('Error processing attachment:', error);
        await sendErrorEmail(from, 'Error processing worksheet. Please try again.');
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to extract QR code from image
async function extractQRCode(imageBuffer: Buffer): Promise<string | null> {
  // You'll need to install: npm install qrcode-reader jimp
  const Jimp = require('jimp');
  const QrCode = require('qrcode-reader');

  try {
    const image = await Jimp.read(imageBuffer);
    const qr = new QrCode();

    return new Promise((resolve) => {
      qr.callback = (err: any, value: any) => {
        if (err || !value) {
          console.error('QR decode error:', err);
          resolve(null);
        } else {
          resolve(value.result);
        }
      };
      qr.decode(image.bitmap);
    });
  } catch (error) {
    console.error('QR extraction error:', error);
    return null;
  }
}

// Process the worksheet submission
async function processWorksheetSubmission(
  supabase: any,
  qrCode: string,
  imageBuffer: Buffer,
  submitterEmail: string
) {
  // Look up worksheet by QR code
  const { data: worksheet, error: worksheetError } = await supabase
    .from('worksheets')
    .select(`
      *,
      students!inner(
        id,
        initials,
        grade_level,
        provider_id
      )
    `)
    .eq('qr_code', qrCode)
    .single();

  if (worksheetError || !worksheet) {
    throw new Error('Worksheet not found');
  }

  // Upload image to Supabase Storage
  const fileName = `${worksheet.id}/${Date.now()}.jpg`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('worksheet-submissions')
    .upload(fileName, imageBuffer, {
      contentType: 'image/jpeg'
    });

  if (uploadError) {
    throw uploadError;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('worksheet-submissions')
    .getPublicUrl(fileName);

  // TODO: Add AI vision analysis here if you have Claude/GPT-4 Vision API
  // For now, we'll simulate with random accuracy
  const mockAccuracy = 70 + Math.random() * 30; // 70-100%

  // Save submission
  const { data: submission, error: submissionError } = await supabase
    .from('worksheet_submissions')
    .insert({
      worksheet_id: worksheet.id,
      submitted_by: worksheet.students.provider_id,
      image_url: publicUrl,
      accuracy_percentage: mockAccuracy,
      skills_assessed: [{
        skill: worksheet.worksheet_type,
        correct: Math.floor(mockAccuracy / 10),
        total: 10,
        percentage: mockAccuracy
      }]
    })
    .select()
    .single();

  if (submissionError) {
    throw submissionError;
  }

  return {
    success: true,
    studentInitials: worksheet.students.initials,
    accuracy: mockAccuracy.toFixed(1),
    worksheetType: worksheet.worksheet_type,
    feedback: mockAccuracy >= 80 ? 'Great work!' : 'Keep practicing!'
  };
}

// Send error email
async function sendErrorEmail(to: string, message: string) {
  try {
    await resend.emails.send({
      from: 'IEP Progress <progress@speddy.xyz>',
      to: to,
      subject: 'Error processing worksheet',
      html: `
        <p>${message}</p>
        <p>Please ensure:</p>
        <ol>
          <li>The QR code is clearly visible in the image</li>
          <li>The image is well-lit and in focus</li>
          <li>The entire worksheet is in the photo</li>
        </ol>
      `
    });
  } catch (error) {
    console.error('Error sending error email:', error);
  }
}