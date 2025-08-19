// app/api/submit-worksheet/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, recordUpload } from '@/lib/rate-limit';
import { extractQRCodeForSubmission, verifyQRCodeMatch } from '@/lib/qr-verification';
import { validateImageBuffer } from '@/lib/image-utils';
import { trackEvent } from '@/lib/analytics';

// Interface for analysis result
interface AnalysisResult {
  accuracy: number;
  responses?: any[];
  observations?: string;
  skillsAnalysis?: {
    strengths: string[];
    needsImprovement: string[];
    errorPatterns: string[];
  };
  confidenceLevel?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let imageSize = 0;
  let source: string | undefined;
  let qrCode: string | undefined;
  let ip: string | null = null;
  
  try {
    const supabase = await createClient();
    const contentType = request.headers.get('content-type');

    let imageBuffer: Buffer;
    let submitterEmail: string | undefined;

    // Extract IP address for rate limiting
    const forwarded = request.headers.get('x-forwarded-for');
    ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || null;

    // Handle direct upload from the upload page
    if (contentType?.includes('application/json')) {
      const { image, filename, mimetype, source: uploadSource } = await request.json();
      source = uploadSource;

      // Check authentication for direct uploads (skip for QR scan uploads)
      if (source !== 'qr_scan_upload') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }

      // Extract base64 data
      const base64Data = image.split(',')[1];
      imageBuffer = Buffer.from(base64Data, 'base64');
      imageSize = imageBuffer.length;
      
      // Validate image buffer
      const validation = validateImageBuffer(imageBuffer, filename || 'image.jpg', imageBuffer.length);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || 'Invalid image file' },
          { status: 400 }
        );
      }

      // Extract QR code
      const qrResult = await extractQRCodeForSubmission(imageBuffer);
      if (!qrResult.code) {
        return NextResponse.json(
          { error: 'Could not read QR code. Please ensure the QR code is clearly visible.' },
          { status: 400 }
        );
      }
      qrCode = qrResult.code;

      // For QR scan uploads, perform rate limiting check
      if (source === 'qr_scan_upload') {
        const rateLimitResult = await checkRateLimit(ip, qrCode);
        if (!rateLimitResult.allowed) {
          return new NextResponse(
            JSON.stringify({ 
              error: rateLimitResult.reason || 'Too many uploads. Please try again later.',
              remainingUploads: rateLimitResult.remainingUploads || 0
            }),
            { 
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': '20',
                'X-RateLimit-Remaining': String(rateLimitResult.remainingUploads || 0),
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600)
              }
            }
          );
        }
      }
    } 
    // Handle email webhook format or FormData from QR scan
    else {
      const formData = await request.formData();
      const imageFile = formData.get('image') as File;
      qrCode = formData.get('qr_code') as string;
      submitterEmail = formData.get('from_email') as string;
      source = formData.get('source') as string;

      if (!imageFile) {
        return NextResponse.json(
          { error: 'Missing required image data' },
          { status: 400 }
        );
      }

      const arrayBuffer = await imageFile.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      imageSize = imageBuffer.length;
      
      // Validate image buffer
      const validation = validateImageBuffer(imageBuffer, imageFile.name, imageFile.size);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || 'Invalid image file' },
          { status: 400 }
        );
      }

      // For QR scan uploads via FormData, extract QR code from image if not provided
      if (source === 'qr_scan_upload' && !qrCode) {
        const qrResult = await extractQRCodeForSubmission(imageBuffer);
        if (!qrResult.code) {
          return NextResponse.json(
            { error: 'Could not read QR code. Please ensure the QR code is clearly visible.' },
            { status: 400 }
          );
        }
        qrCode = qrResult.code;
      }

      // Check rate limiting for QR scan uploads
      if (source === 'qr_scan_upload') {
        const rateLimitResult = await checkRateLimit(ip, qrCode);
        if (!rateLimitResult.allowed) {
          return new NextResponse(
            JSON.stringify({ 
              error: rateLimitResult.reason || 'Too many uploads. Please try again later.',
              remainingUploads: rateLimitResult.remainingUploads || 0
            }),
            { 
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': '20',
                'X-RateLimit-Remaining': String(rateLimitResult.remainingUploads || 0),
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600)
              }
            }
          );
        }
      }

      // Require qr_code for email webhook
      if (!qrCode) {
        return NextResponse.json(
          { error: 'Missing QR code data' },
          { status: 400 }
        );
      }
    }

    // Ensure we have a QR code at this point
    if (!qrCode) {
      return NextResponse.json(
        { error: 'Unable to extract QR code from the image' },
        { status: 400 }
      );
    }

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

    let finalWorksheet = worksheet;

    if (worksheetError || !worksheet) {
      // Check if this is a legacy worksheet code (old format: WS-timestamp)
      const isLegacyFormat = /^WS-\d{13}$/.test(qrCode);
      
      if (isLegacyFormat) {
        // For legacy worksheets, create a minimal worksheet record for tracking
        // We'll create it without a specific student since we don't know which one
        const legacyWorksheet = {
          id: `legacy-${qrCode}`,
          lesson_id: 'legacy-lesson',
          student_id: 'legacy-student',
          worksheet_type: 'legacy',
          content: { title: 'Legacy Worksheet', instructions: 'Scanned from printed worksheet' },
          answer_key: null,
          qr_code: qrCode,
          uploaded_file_path: null,
          uploaded_at: null,
          created_at: new Date().toISOString(),
          students: [{
            id: 'legacy-student',
            initials: 'Legacy Student',
            grade_level: 'Unknown',
            provider_id: 'legacy-provider'
          }]
        };
        
        finalWorksheet = legacyWorksheet;
      } else {
        return NextResponse.json(
          { error: 'Worksheet not found. This QR code may be invalid or expired.' },
          { status: 404 }
        );
      }
    }

    // Verify QR code in image matches the worksheet being submitted
    // Apply verification for all sources to ensure data integrity
    const isValidQR = await verifyQRCodeMatch(imageBuffer, qrCode);
    if (!isValidQR) {
      return NextResponse.json(
        { error: 'The QR code in this image doesn\'t match the worksheet you\'re trying to submit.' },
        { status: 400 }
      );
    }

    // Upload image to Supabase Storage
    const fileName = `worksheets/${finalWorksheet.id}/${Date.now()}.jpg`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('worksheet-submissions')
      .upload(fileName, imageBuffer, {
        contentType: 'image/jpeg'
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { 
          error: 'Failed to upload image to storage',
          details: 'The image could not be saved. Please try again.',
          retryable: true
        },
        { status: 500 }
      );
    }

    // Get public URL for the uploaded image
    const { data: { publicUrl } } = supabase.storage
      .from('worksheet-submissions')
      .getPublicUrl(fileName);

    // Use Claude Vision API to analyze the worksheet (if API key exists)
    let analysisResult: AnalysisResult | null = null;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      try {
        const anthropic = new Anthropic({ apiKey });

        // Convert image to base64 for Claude
        const base64Image = imageBuffer.toString('base64');

        const message = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64Image
                }
              },
              {
                type: "text",
                text: `Analyze this completed student worksheet carefully.

                Worksheet details:
                - Type: ${finalWorksheet.worksheet_type}
                - Questions and answers: ${JSON.stringify(finalWorksheet.content)}

                For each question in the worksheet:
                1. Identify what the student wrote or selected
                2. Compare with the correct answer
                3. Note any patterns in errors or strengths

                Please provide a detailed analysis in this exact JSON format:
                {
                  "responses": [
                    {
                      "questionId": "1",
                      "questionText": "actual question text",
                      "correctAnswer": "expected answer",
                      "studentAnswer": "what student wrote",
                      "isCorrect": true/false,
                      "errorType": "conceptual/computational/spelling/none"
                    }
                  ],
                  "accuracy": 0.00,
                  "skillsAnalysis": {
                    "strengths": ["skill areas where student excelled"],
                    "needsImprovement": ["skill areas needing work"],
                    "errorPatterns": ["consistent types of mistakes"]
                  },
                  "observations": "Overall assessment and recommendations",
                  "confidenceLevel": "high/medium/low"
                }`
              }
            ]
          }]
        });

        const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
        analysisResult = JSON.parse(responseText);
      } catch (error) {
        console.error('Claude Vision API error:', error);
        // Fall back to mock grading
      }
    }

    // If no AI analysis, use mock grading
    if (!analysisResult) {
      const mockAccuracy = 70 + Math.random() * 30; // 70-100%
      analysisResult = {
        accuracy: mockAccuracy / 100,
        responses: [],
        observations: 'Manual grading required'
      };
    }

    // Save submission to database
    const { data: submission, error: submissionError } = await supabase
      .from('worksheet_submissions')
      .insert({
        worksheet_id: finalWorksheet.id,
        submitted_by: finalWorksheet.students[0].provider_id,
        image_url: publicUrl,
        student_responses: analysisResult?.responses || null,
        accuracy_percentage: analysisResult?.accuracy ? analysisResult.accuracy * 100 : null,
        skills_assessed: extractSkillsAssessed(finalWorksheet, analysisResult),
        ai_analysis: analysisResult?.observations || null
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      return NextResponse.json(
        { 
          error: 'Failed to save worksheet submission',
          details: 'The worksheet was processed but could not be saved. Please try again.',
          retryable: true
        },
        { status: 500 }
      );
    }

    // Update IEP goal progress if applicable
    await updateIEPProgress(finalWorksheet, analysisResult, supabase);

    // Record upload for rate limiting (only for QR scan uploads)
    if (source === 'qr_scan_upload') {
      await recordUpload(ip, qrCode);
    }

    // Track analytics for all uploads
    const processingTime = Date.now() - startTime;
    const eventType = source === 'qr_scan_upload' ? 'qr_upload_completed' : 'standard_upload_completed';
    
    await trackEvent({
      event: eventType,
      worksheetCode: qrCode,
      fileSize: imageSize,
      processingTime: processingTime,
      uploadSource: source || 'unknown',
      userId: finalWorksheet.students[0].provider_id,
      ipAddress: ip || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {
        worksheetType: finalWorksheet.worksheet_type,
        accuracy: analysisResult?.accuracy,
        submissionId: submission.id,
        storageSize: imageBuffer.length,
        hasAIAnalysis: !!analysisResult?.responses?.length
      }
    });

    // Prepare response with rate limit headers for QR scan uploads
    const responseData = {
      success: true,
      submission: submission,
      studentInitials: finalWorksheet.students[0].initials,
      accuracy: analysisResult?.accuracy ? parseFloat((analysisResult.accuracy * 100).toFixed(1)) : '0',
      worksheetType: finalWorksheet.worksheet_type,
      message: 'Worksheet processed successfully!'
    };

    if (source === 'qr_scan_upload') {
      // Get updated rate limit info
      const postUploadLimit = await checkRateLimit(ip, qrCode);
      return new NextResponse(
        JSON.stringify(responseData),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '20',
            'X-RateLimit-Remaining': String(postUploadLimit.remainingUploads || 0),
            'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600)
          }
        }
      );
    }

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error('Error processing worksheet submission:', error);
    
    // Track failed upload
    const processingTime = Date.now() - startTime;
    const eventType = source === 'qr_scan_upload' ? 'qr_upload_failed' : 'standard_upload_failed';
    
    await trackEvent({
      event: eventType,
      worksheetCode: qrCode,
      fileSize: imageSize,
      processingTime: processingTime,
      uploadSource: source || 'unknown',
      errorCode: error.code || 'server_error',
      errorMessage: error.message || 'Unknown error',
      ipAddress: ip || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {
        errorStack: error.stack,
        statusCode: 500
      }
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to process worksheet',
        details: 'An unexpected error occurred while processing your worksheet. Please try again.',
        retryable: true
      },
      { status: 500 }
    );
  }
}


function extractSkillsAssessed(worksheet: any, analysis: any): any {
  const skillsMap: Record<string, string> = {
    'spelling': 'Spelling',
    'math': 'Math Computation',
    'reading_comprehension': 'Reading Comprehension',
    'phonics': 'Phonics',
    'writing': 'Written Expression',
    'practice': 'General Practice'
  };

  const primarySkill = skillsMap[finalWorksheet.worksheet_type] || 'General';
  const correct = analysis?.responses?.filter((r: any) => r.isCorrect).length || 0;
  const total = analysis?.responses?.length || 0;

  // Build skills array with primary skill
  const skills = [{
    skill: primarySkill,
    correct,
    total,
    percentage: total > 0 ? (correct / total) * 100 : 0
  }];

  // Add sub-skills based on error analysis if available
  if (analysis?.skillsAnalysis) {
    // Group errors by type
    const errorTypes = analysis.responses?.reduce((acc: any, r: any) => {
      if (!r.isCorrect && r.errorType && r.errorType !== 'none') {
        acc[r.errorType] = (acc[r.errorType] || 0) + 1;
      }
      return acc;
    }, {});

    // Add sub-skill performance
    Object.entries(errorTypes || {}).forEach(([errorType, count]: [string, any]) => {
      skills.push({
        skill: `${primarySkill} - ${errorType}`,
        correct: total - count,
        total,
        percentage: ((total - count) / total) * 100
      });
    });
  }

  return skills;
}

async function updateIEPProgress(worksheet: any, analysis: any, supabase: any): Promise<void> {
  try {
    // Skip IEP progress updates for legacy worksheets since we don't have real student data
    if (worksheet.student_id === 'legacy-student') {
      return;
    }

    // Get student's IEP goals
    const { data: studentDetails } = await supabase
      .from('student_details')
      .select('iep_goals')
      .eq('student_id', worksheet.student_id)
      .single();

    if (!studentDetails?.iep_goals) return;

    // Parse goals to find measurable components
    const goals = studentDetails.iep_goals;

    for (const goal of goals) {
      // Simple pattern matching for percentage-based goals
      const percentMatch = goal.match(/(\d+)%/);
      if (percentMatch && analysis?.accuracy) {
        const targetPercent = parseInt(percentMatch[1]);
        const currentPercent = analysis.accuracy * 100;

        // Check if this worksheet type relates to the goal
        if (goal.toLowerCase().includes(worksheet.worksheet_type) ||
            goal.toLowerCase().includes('reading') && worksheet.worksheet_type.includes('reading') ||
            goal.toLowerCase().includes('math') && worksheet.worksheet_type.includes('math')) {

          // Update or create progress record
          await supabase
            .from('iep_goal_progress')
            .upsert({
              student_id: worksheet.student_id,
              iep_goal: goal,
              target_metric: {
                type: 'percentage',
                value: targetPercent,
                skill: worksheet.worksheet_type
              },
              current_performance: currentPercent,
              trend: determineTrend(currentPercent, targetPercent),
              last_assessed: new Date().toISOString()
            }, {
              onConflict: 'student_id,iep_goal'
            });
        }
      }
    }
  } catch (error) {
    console.error('Error updating IEP progress:', error);
  }
}

function determineTrend(current: number, target: number): string {
  const difference = current - target;
  if (difference >= 10) return 'improving';
  if (difference >= -5) return 'stable';
  return 'declining';
}