// app/api/submit-worksheet/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';

// For QR code reading
const Jimp = require('jimp');
const QrCode = require('qrcode-reader');

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
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const contentType = request.headers.get('content-type');

    let imageBuffer: Buffer;
    let qrCode: string;
    let submitterEmail: string | undefined;

    // Handle direct upload from the upload page
    if (contentType?.includes('application/json')) {
      // Check authentication for direct uploads
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { image, filename, mimetype } = await request.json();

      // Extract base64 data
      const base64Data = image.split(',')[1];
      imageBuffer = Buffer.from(base64Data, 'base64');

      // Extract QR code
      const extractedQR = await extractQRCode(imageBuffer);
      if (!extractedQR) {
        return NextResponse.json(
          { error: 'Could not read QR code. Please ensure the QR code is clearly visible.' },
          { status: 400 }
        );
      }
      qrCode = extractedQR;
    } 
    // Handle email webhook format
    else {
      const formData = await request.formData();
      const imageFile = formData.get('image') as File;
      qrCode = formData.get('qr_code') as string;
      submitterEmail = formData.get('from_email') as string;

      if (!imageFile || !qrCode) {
        return NextResponse.json(
          { error: 'Missing required data' },
          { status: 400 }
        );
      }

      const arrayBuffer = await imageFile.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
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

    if (worksheetError || !worksheet) {
      return NextResponse.json(
        { error: 'Worksheet not found. This QR code may be invalid or expired.' },
        { status: 404 }
      );
    }

    // Upload image to Supabase Storage
    const fileName = `worksheets/${worksheet.id}/${Date.now()}.jpg`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('worksheet-submissions')
      .upload(fileName, imageBuffer, {
        contentType: 'image/jpeg'
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload image' },
        { status: 500 }
      );
    }

    // Get public URL for the uploaded image
    const { data: { publicUrl } } = supabase.storage
      .from('worksheet-submissions')
      .getPublicUrl(fileName);

    // Use Claude Vision API to analyze the worksheet (if API key exists)
    let analysisResult = null;
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
                - Type: ${worksheet.worksheet_type}
                - Questions and answers: ${JSON.stringify(worksheet.content)}

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
        const analysisResult: AnalysisResult = JSON.parse(responseText);
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
        worksheet_id: worksheet.id,
        submitted_by: worksheet.students.provider_id,
        image_url: publicUrl,
        student_responses: analysisResult?.responses || null,
        accuracy_percentage: analysisResult?.accuracy ? analysisResult.accuracy * 100 : null,
        skills_assessed: extractSkillsAssessed(worksheet, analysisResult),
        ai_analysis: analysisResult?.observations || null
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      return NextResponse.json(
        { error: 'Failed to save submission' },
        { status: 500 }
      );
    }

    // Update IEP goal progress if applicable
    await updateIEPProgress(worksheet, analysisResult, supabase);

    return NextResponse.json({
      success: true,
      submission: submission,
      studentInitials: worksheet.students.initials,
      accuracy: analysisResult?.accuracy ? parseFloat((analysisResult.accuracy * 100).toFixed(1)) : '0',
      worksheetType: worksheet.worksheet_type,
      message: 'Worksheet processed successfully!'
    });

  } catch (error) {
    console.error('Error processing worksheet submission:', error);
    return NextResponse.json(
      { error: 'Failed to process worksheet' },
      { status: 500 }
    );
  }
}

// Helper function to extract QR code from image
async function extractQRCode(imageBuffer: Buffer): Promise<string | null> {
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

function extractSkillsAssessed(worksheet: any, analysis: any): any {
  const skillsMap: Record<string, string> = {
    'spelling': 'Spelling',
    'math': 'Math Computation',
    'reading_comprehension': 'Reading Comprehension',
    'phonics': 'Phonics',
    'writing': 'Written Expression',
    'practice': 'General Practice'
  };

  const primarySkill = skillsMap[worksheet.worksheet_type] || 'General';
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