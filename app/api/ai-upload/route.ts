// app/api/ai-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

// Force Node.js runtime for file processing
export const runtime = 'nodejs';

// Supported file types - expanded list
const SUPPORTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/rtf',
  'text/rtf'
];

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const uploadType = formData.get('type') as string;

    console.log('Processing file:', file?.name, 'Type:', file?.type, 'Size:', file?.size);

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check if file type is supported
    if (!SUPPORTED_TYPES.includes(file.type) && !file.type.includes('wordprocessing')) {
      console.log('Unsupported file type:', file.type);
      return NextResponse.json({ 
        error: 'Unsupported file type. Please upload PDF, Word, Excel, CSV, or text files.' 
      }, { status: 400 });
    }

    // Convert file to text based on type
    let fileContent = '';
    let extractionMethod = '';

    try {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (file.type === 'application/pdf') {
        // Process PDF files
        extractionMethod = 'PDF';
        const pdfParse = await loadPdfParse();

        if (!pdfParse) {
          // Fallback if pdf-parse won't load
          return NextResponse.json({ 
            error: 'PDF processing is temporarily unavailable. Please try converting to Word or text format.' 
          }, { status: 500 });
        }

        try {
          console.log('Attempting to parse PDF...');
          const pdfData = await pdfParse(buffer, {
            max: 0, // no page limit
            // Try without version specification first
          });

          fileContent = pdfData.text;
          console.log(`PDF extracted successfully. Length: ${fileContent.length}`);

          // If that didn't work well, try with specific options
          if (!fileContent || fileContent.length < 50) {
            console.log('Retrying PDF parse with different options...');
            const pdfData2 = await pdfParse(buffer);
            fileContent = pdfData2.text || fileContent;
          }
        } catch (pdfError: any) {
          console.error('PDF parse error:', pdfError.message);
          throw new Error(`PDF parsing failed: ${pdfError.message}`);
        }

      } else if (file.type.includes('wordprocessing') || file.type === 'application/msword') {
        // Process Word documents
        extractionMethod = 'Word';
        const result = await mammoth.extractRawText({ buffer });
        fileContent = result.value;
        console.log(`Word document extracted. Length: ${fileContent.length}`);

      } else if (file.type.includes('sheet') || file.type.includes('excel')) {
        // Process Excel files
        extractionMethod = 'Excel';
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        // Convert all sheets to text
        const allText: string[] = [];
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const csvData = XLSX.utils.sheet_to_csv(worksheet);
          allText.push(`=== Sheet: ${sheetName} ===\n${csvData}`);
        });

        fileContent = allText.join('\n\n');
        console.log(`Excel extracted. Sheets: ${workbook.SheetNames.length}, Length: ${fileContent.length}`);

      } else if (file.type === 'text/csv' || file.type === 'text/plain' || file.type.includes('rtf')) {
        // Process text-based files
        extractionMethod = 'Text';
        fileContent = new TextDecoder().decode(buffer);
        console.log(`Text file extracted. Length: ${fileContent.length}`);
      }

    } catch (error: any) {
      console.error('File extraction error:', error);
      return NextResponse.json({ 
        error: `Failed to extract content from ${extractionMethod} file: ${error.message}. Please ensure the file is not corrupted or password-protected.` 
      }, { status: 400 });
    }

    if (!fileContent || fileContent.trim().length === 0) {
      return NextResponse.json({ 
        error: 'No readable content found in the file. The file might be empty, corrupted, or contain only images.' 
      }, { status: 400 });
    }

    // Truncate if too long for Claude
    const maxLength = 50000; // Conservative limit
    if (fileContent.length > maxLength) {
      console.log(`Content too long (${fileContent.length}), truncating to ${maxLength}`);
      fileContent = fileContent.substring(0, maxLength) + '\n... [content truncated]';
    }

    console.log(`File content ready. Method: ${extractionMethod}, Final length: ${fileContent.length}`);

    // Get user's school information
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_site, school_district')
      .eq('id', user.id)
      .single();

    // Get existing data for validation
    let existingData: any = {};

    if (uploadType === 'students') {
      const { data: students } = await supabase
        .from('students')
        .select('initials, teacher_name')
        .eq('provider_id', user.id);
      existingData.students = students || [];
    } else if (uploadType === 'bell_schedule') {
      const { data: schedules } = await supabase
        .from('bell_schedules')
        .select('grade_level, period_name')
        .eq('provider_id', user.id);
      existingData.schedules = schedules || [];
    } else if (uploadType === 'special_activities') {
      const { data: activities } = await supabase
        .from('special_activities')
        .select('teacher_name, activity_name')
        .eq('provider_id', user.id);
      existingData.activities = activities || [];
    }

    // Process with Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });

    // Create intelligent prompts
    const systemPrompt = createIntelligentSystemPrompt(uploadType, extractionMethod);
    const userPrompt = createUserPrompt(fileContent, uploadType, existingData, profile);

    console.log('Sending to Claude for intelligent parsing...');

    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4000,
      temperature: 0.2, // Lower temperature for more consistent parsing
      messages: [
        { role: "user", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    // Parse Claude's response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    let parsedData;

    try {
      // Remove any markdown formatting Claude might have added
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : responseText;
      parsedData = JSON.parse(jsonText);
      console.log('Successfully parsed AI response');
      console.log(`Results: ${parsedData.confirmed?.length || 0} confirmed, ${parsedData.ambiguous?.length || 0} ambiguous, ${parsedData.errors?.length || 0} errors`);
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      console.error('Raw response:', responseText.substring(0, 500));
      return NextResponse.json({ 
        error: 'The AI had trouble understanding the file format. Please try a different file or format.' 
      }, { status: 500 });
    }

    // Return parsed data for user review
    return NextResponse.json({
      success: true,
      data: parsedData,
      uploadType,
      extractionMethod,
      fileName: file.name
    });

  } catch (error: any) {
    console.error('AI Upload error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

function createIntelligentSystemPrompt(uploadType: string, fileType: string): string {
  const basePrompt = `You are an expert AI assistant helping special education teachers save time by intelligently extracting and organizing data from their files. 

  You're processing a ${fileType} file that contains ${uploadType.replace('_', ' ')} information.

  Your task is to:
  1. Intelligently identify and extract relevant information regardless of format
  2. Handle messy, real-world documents that teachers actually use
  3. Make smart assumptions when data is ambiguous (but flag it for review)
  4. Be flexible with formats - teachers use many different styles

  The file might contain:
  - Formal tables and structured data
  - Informal lists and notes
  - Mixed formats and layouts
  - Abbreviations and shorthand
  - Multiple types of information mixed together
  - Headers, footers, and irrelevant content to ignore

  Be VERY forgiving and intelligent about extracting data. Teachers are busy and their documents aren't perfect.

  Return your results as JSON with these keys:
  - confirmed: Array of items you're confident about
  - ambiguous: Array of items that need human review (with your best guess)
  - errors: Array of content you couldn't parse at all

  IMPORTANT: Return ONLY valid JSON. No explanations or markdown.`;

  const typeSpecificPrompts = {
    students: `
      For STUDENT data, look for:
      - Student names (convert to initials for privacy)
      - Grade levels (K, TK, 1-12, etc.)
      - Teacher names (in any format)
      - Service minutes/sessions (might be written many ways)
      - IEP information
      - Class rosters
      - Any lists of children

      Output format for each student:
      {
        "initials": "JD",
        "grade_level": "3",
        "teacher_name": "Smith",
        "sessions_per_week": 2,
        "minutes_per_session": 30
      }

      Smart parsing tips:
      - "2x30" or "2 x 30 min" = 2 sessions, 30 minutes each
      - "Mrs. S" or "Smith" or "S. Smith" = all refer to teacher Smith
      - If only a list of names, assume standard 2x30 sessions
      - Grade might be written as "3rd grade" or "Grade 3" or just "3"`,

    bell_schedule: `
      For BELL SCHEDULE data, look for:
      - Time blocks (recess, lunch, class periods)
      - Grade levels or classrooms
      - Days of the week
      - Special schedules (early release, conferences)
      - Any mention of when students are unavailable

      Output format for each schedule item:
      {
        "grade_level": "K",
        "period_name": "Recess",
        "start_time": "10:00",
        "end_time": "10:15",
        "days": [1, 2, 3, 4, 5]
      }

      Smart parsing tips:
      - Convert all times to 24-hour format
      - "MWF" = [1,3,5], "M-F" = [1,2,3,4,5], "Daily" = [1,2,3,4,5]
      - "Kindergarten" = "K", "First Grade" = "1"
      - Multiple grades like "1st-3rd" = "1,2,3"
      - Common periods: Recess, Lunch, PE, Music, Library, Art`,

    special_activities: `
      For SPECIAL ACTIVITIES data, look for:
      - Teacher schedules
      - Prep periods
      - Special events (PE, Music, Library, etc.)
      - When teachers are unavailable
      - Any activities that take students away from class

      Output format for each activity:
      {
        "teacher_name": "Smith",
        "activity_name": "PE",
        "day_of_week": 1,
        "start_time": "10:00",
        "end_time": "11:00"
      }

      Smart parsing tips:
      - Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5
      - "Prep" or "Planning" = teacher prep time
      - Look for patterns like "Smith - PE - Mon 10-11"`
  };

  return basePrompt + '\n\n' + (typeSpecificPrompts[uploadType as keyof typeof typeSpecificPrompts] || '');
}

function createUserPrompt(
  fileContent: string, 
  uploadType: string, 
  existingData: any,
  profile: any
): string {
  let prompt = `Please intelligently extract ${uploadType.replace('_', ' ')} data from this file:\n\n${fileContent}\n\n`;

  // Add context about existing data
  if (uploadType === 'students' && existingData.students?.length > 0) {
    const teachers = [...new Set(existingData.students.map((s: any) => s.teacher_name))];
    prompt += `\nContext: Existing teachers in the system include: ${teachers.join(', ')}. Try to match teacher names to these when possible.\n`;
  }

  if (profile) {
    prompt += `\nSchool context: ${profile.school_site} in ${profile.school_district}\n`;
  }

  prompt += `\nRemember: 
  - Be intelligent and flexible with formats
  - Make reasonable assumptions 
  - Flag anything uncertain as "ambiguous"
  - Return ONLY valid JSON`;

  return prompt;
}