// app/api/ai-upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';

// Force Node.js runtime for file processing
export const runtime = "nodejs";

// Supported file types - expanded list
const SUPPORTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/rtf",
  "text/rtf",
];

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('ai_upload', 'api');
  
  try {
    const supabase = await createClient();

    // Get form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const uploadType = formData.get("type") as string;

    log.info('Processing file upload', {
      userId,
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size,
      uploadType
    });

    if (!file) {
      log.warn('No file provided in upload request', { userId });
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Check if file type is supported
    if (
      !SUPPORTED_TYPES.includes(file.type) &&
      !file.type.includes("wordprocessing")
    ) {
      log.warn('Unsupported file type uploaded', {
        userId,
        fileType: file.type,
        fileName: file.name
      });
      
      track.event('file_upload_unsupported_type', {
        userId,
        fileType: file.type
      });
      
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Please upload PDF, Word, Excel, CSV, or text files.",
        },
        { status: 400 },
      );
    }

    // Convert file to text based on type
    let fileContent = "";
    let extractionMethod = "";

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (file.type === 'application/pdf') {
      extractionMethod = 'PDF';

      try {
        log.info('Processing PDF via PDF.co API', { userId, fileName: file.name });

        const API_KEY = process.env.PDF_API_KEY;
        if (!API_KEY) {
          log.error('PDF API key not configured', null, { userId });
          return NextResponse.json({ 
            error: 'PDF processing not configured. Please add PDF_API_KEY to environment variables.' 
          }, { status: 500 });
        }

        // Step 1: Upload the file to PDF.co
        const uploadPerf = measurePerformanceWithAlerts('pdf_upload', 'api');
        const formData = new FormData();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        formData.append('file', blob, file.name);

        const uploadResponse = await fetch('https://api.pdf.co/v1/file/upload', {
          method: 'POST',
          headers: {
            'x-api-key': API_KEY
          },
          body: formData
        });

        const uploadResult = await uploadResponse.json();
        uploadPerf.end({ success: !uploadResult.error });
        
        log.info('PDF upload result', {
          userId,
          success: !uploadResult.error,
          fileUrl: uploadResult.url ? 'URL generated' : 'No URL'
        });

        if (uploadResult.error || !uploadResult.url) {
          throw new Error(uploadResult.message || 'Failed to upload file');
        }

        // Step 2: Convert the uploaded file to text
        const convertPerf = measurePerformanceWithAlerts('pdf_convert', 'api');
        const convertResponse = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
          method: 'POST',
          headers: {
            'x-api-key': API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: uploadResult.url,
            inline: true,
            async: false
          })
        });

        const convertResult = await convertResponse.json();
        convertPerf.end({ success: convertResult.error === false });
        
        log.info('PDF conversion result', {
          userId,
          success: convertResult.error === false,
          textLength: convertResult.body?.length || 0
        });

        if (convertResult.error === false && convertResult.body) {
          fileContent = convertResult.body;
          log.info('PDF text extracted successfully', {
            userId,
            contentLength: fileContent.length
          });
          
          // Additional validation for PDF content
          if (!fileContent || fileContent.length === 0) {
            throw new Error('PDF conversion returned empty content');
          }
          
          // Check if the PDF might be scanned/image-based
          const words = fileContent.trim().split(/\s+/);
          if (words.length < 10) {
            log.warn('PDF appears to contain very little text', {
              userId,
              wordCount: words.length,
              contentPreview: fileContent.substring(0, 200)
            });
            throw new Error('PDF appears to be image-based or contains very little text. Please use a text-based PDF or convert to Word format.');
          }
        } else {
          throw new Error(convertResult.message || 'Failed to extract text');
        }

      } catch (error: any) {
        log.error('PDF API error', error, {
          userId,
          fileName: file.name
        });
        
        track.event('pdf_processing_failed', {
          userId,
          error: error.message
        });
        
        return NextResponse.json({ 
          error: 'Failed to process PDF. Please try converting to Word format.' 
        }, { status: 500 });
      }
    } else if (file.type.includes("sheet") || file.type.includes("excel")) {
      // Process Excel files
      extractionMethod = "Excel";

      try {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // Convert all sheets to text
        const allText: string[] = [];
        workbook.eachSheet((worksheet: any, sheetId: number) => {
          const sheetData: string[] = [];
          worksheet.eachRow((row: any, rowNumber: number) => {
            sheetData.push(row.values.slice(1).join(','));
          });
          allText.push(`=== Sheet: ${worksheet.name} ===\n${sheetData.join('\n')}`);
        });

        fileContent = allText.join("\n\n");
        log.info('Excel file extracted', {
          userId,
          contentLength: fileContent.length,
          sheetCount: workbook.worksheets.length
        });
      } catch (xlsxError) {
        log.error('Error processing Excel file', xlsxError, {
          userId,
          fileName: file.name
        });
        return NextResponse.json(
          { error: "Failed to process Excel file. Please try converting to CSV." },
          { status: 500 }
        );
      }
    } else if (
      file.type.includes("wordprocessing") ||
      file.type.includes("msword") ||
      file.type.includes("text") ||
      file.type.includes("csv") ||
      file.type.includes("rtf")
    ) {
      // Process Word documents
      if (file.type.includes("wordprocessing") || file.type.includes("msword")) {
        extractionMethod = "Word";
        try {
          const result = await mammoth.extractRawText({ buffer });
          fileContent = result.value;
          log.info('Word document extracted', {
            userId,
            contentLength: fileContent.length
          });
        } catch (mammothError) {
          log.error('Error processing Word document', mammothError, {
            userId,
            fileName: file.name
          });
          return NextResponse.json(
            { error: "Failed to process Word document. Please try converting to PDF or text." },
            { status: 500 }
          );
        }
      } else {
        // Process text-based files
        extractionMethod = "Text";
        fileContent = new TextDecoder().decode(buffer);
        log.info('Text file extracted', {
          userId,
          contentLength: fileContent.length
        });
      }
    }
  } catch (error: any) {
    log.error('File extraction error', error, {
      userId,
      extractionMethod,
      fileName: file.name
    });
    
    track.event('file_extraction_failed', {
      userId,
      extractionMethod,
      error: error.message
    });
    
    return NextResponse.json(
      {
        error: `Failed to extract content from ${extractionMethod} file: ${error.message}. Please ensure the file is not corrupted or password-protected.`,
      },
      { status: 400 },
    );
  }

    // Check if the extracted content is binary or corrupted
    const isBinaryContent = (content: string): boolean => {
      if (!content || content.length === 0) return true;
      
      // Check for null bytes or excessive non-printable characters
      let nonPrintableCount = 0;
      const sampleSize = Math.min(content.length, 1000);
      
      for (let i = 0; i < sampleSize; i++) {
        const charCode = content.charCodeAt(i);
        // Count non-printable characters (excluding common whitespace)
        if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
          nonPrintableCount++;
        }
      }
      
      // If more than 10% of the sample is non-printable, it's likely binary
      return (nonPrintableCount / sampleSize) > 0.1;
    };

    // Validate extracted content
    if (!fileContent || fileContent.trim().length === 0) {
      log.error('No content extracted from file', null, {
        userId,
        fileName: file.name,
        extractionMethod
      });
      return NextResponse.json(
        { error: `No readable content found in the ${extractionMethod} file. Please ensure the file contains text and is not empty or corrupted.` },
        { status: 400 }
      );
    }

    if (isBinaryContent(fileContent)) {
      log.error('Binary content detected in extracted text', null, {
        userId,
        fileName: file.name,
        extractionMethod,
        contentPreview: fileContent.substring(0, 100)
      });
      return NextResponse.json(
        { error: `The file appears to be corrupted or in an unreadable binary format. The content contains non-text characters and appears to be damaged or encoded in a way that prevents extraction of ${uploadType.replace('_', ' ')} information.` },
        { status: 400 }
      );
    }

    // Truncate if too long for Claude
    const maxLength = 50000; // Conservative limit
    if (fileContent.length > maxLength) {
      console.log(
        `Content too long (${fileContent.length}), truncating to ${maxLength}`,
      );
      fileContent =
        fileContent.substring(0, maxLength) + "\n... [content truncated]";
    }

    console.log(
      `File content ready. Method: ${extractionMethod}, Final length: ${fileContent.length}`,
    );

    // For bell schedules, apply lighter filtering to avoid missing entries
    if (uploadType === 'bell_schedule') {
      console.log('Processing bell schedule content...');
      
      // Only remove clearly irrelevant lines (empty lines, headers, etc.)
      const lines = fileContent.split('\n');
      const relevantLines = lines.filter(line => {
        const trimmedLine = line.trim();
        
        // Skip empty lines and common headers
        if (!trimmedLine || 
            trimmedLine.length < 3 ||
            trimmedLine.toLowerCase().includes('page ') ||
            trimmedLine.toLowerCase().includes('printed on') ||
            trimmedLine.toLowerCase().includes('generated')) {
          return false;
        }
        
        return true;
      });

      fileContent = relevantLines.join('\n');
      console.log(`Cleaned from ${lines.length} to ${relevantLines.length} lines`);
      
      // Increase the limit significantly to capture all bell schedules
      const bellScheduleMaxLength = 30000; // Much higher limit for bell schedules
      if (fileContent.length > bellScheduleMaxLength) {
        console.log(`Bell schedule content too long (${fileContent.length}), truncating to ${bellScheduleMaxLength}`);
        fileContent = fileContent.substring(0, bellScheduleMaxLength) + '\n... [remaining content truncated for processing]';
      }
    }

    // Get user's school information
    const profilePerf = measurePerformanceWithAlerts('fetch_user_profile', 'database');
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_site, school_district")
      .eq("id", userId)
      .single();
    profilePerf.end({ hasProfile: !!profile });

    // Get existing data for validation
    let existingData: any = {};

    if (uploadType === "students") {
      const { data: students } = await supabase
        .from("students")
        .select("initials, teacher_name")
        .eq("provider_id", userId);
      existingData.students = students || [];
    } else if (uploadType === "bell_schedule") {
      const { data: schedules } = await supabase
        .from("bell_schedules")
        .select("grade_level, period_name")
        .eq("provider_id", userId);
      existingData.schedules = schedules || [];
    } else if (uploadType === "special_activities") {
      const { data: activities } = await supabase
        .from("special_activities")
        .select("teacher_name, activity_name")
        .eq("provider_id", userId);
      existingData.activities = activities || [];
    }

    // Process with Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 },
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // Create intelligent prompts
    const systemPrompt = createIntelligentSystemPrompt(
      uploadType,
      extractionMethod,
    );
    const userPrompt = createUserPrompt(
      fileContent,
      uploadType,
      existingData,
      profile,
    );

    log.info('Sending to Claude for intelligent parsing', {
      userId,
      uploadType,
      contentLength: fileContent.length
    });

    const aiPerf = measurePerformanceWithAlerts('anthropic_parse_file', 'api');
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8000, // Increased to handle more bell schedules
      temperature: 0, // Deterministic for consistent file parsing
      messages: [
        { role: "user", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const aiDuration = aiPerf.end({ uploadType });

    // Parse Claude's response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";
    let parsedData;

    try {
        // Clean up the response text
        let jsonText = responseText.trim();

        // Remove any markdown code blocks
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // Find JSON object (most flexible approach)
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }

        // Attempt to fix common JSON errors
        // Remove trailing commas before ] or }
        jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');

        parsedData = JSON.parse(jsonText);

        // Ensure the parsed data has the expected structure
        if (!parsedData.confirmed) parsedData.confirmed = [];
        if (!parsedData.ambiguous) parsedData.ambiguous = [];
        if (!parsedData.errors) parsedData.errors = [];

        log.info('Successfully parsed AI response', {
          userId,
          uploadType,
          confirmedCount: parsedData.confirmed?.length || 0,
          ambiguousCount: parsedData.ambiguous?.length || 0,
          errorCount: parsedData.errors?.length || 0
        });
        
        track.event('file_parsed_successfully', {
          userId,
          uploadType,
          confirmedCount: parsedData.confirmed?.length || 0,
          ambiguousCount: parsedData.ambiguous?.length || 0,
          errorCount: parsedData.errors?.length || 0,
          aiDuration: Math.round(aiDuration)
        });
    } catch (e) {
      log.error('Failed to parse AI response', e, {
        userId,
        uploadType,
        responsePreview: responseText.substring(0, 500)
      });

      // Try to salvage partial data if possible
      try {
        // Look for confirmed array content
        const confirmedMatch = responseText.match(/"confirmed"\s*:\s*\[([\s\S]*)/);
        if (confirmedMatch) {
          const content = confirmedMatch[1];
          // Type for parsed blocking period items
          interface BlockingPeriodItem {
            grade_level: string;
            period_name: string;
          }
          const items: BlockingPeriodItem[] = [];

          // Extract individual items
          const itemMatches = content.matchAll(/\{[^}]+\}/g);
          for (const match of itemMatches) {
            try {
              const item = JSON.parse(match[0]) as BlockingPeriodItem;
              if (item.grade_level && item.period_name) {
                // Log what we're filtering
                if (item.period_name.toLowerCase() === 'class') {
                  console.log(`Filtering out class period: Grade ${item.grade_level}`);
                } else {
                  console.log(`Keeping blocking period: Grade ${item.grade_level} - ${item.period_name}`);
                  items.push(item);
                }
              }
            } catch {
              // Skip invalid items
            }
          }

          if (items.length > 0) {
            parsedData = {
              confirmed: items,
              ambiguous: [],
              errors: []
            };
            console.log(`Salvaged ${items.length} non-class bell schedule items`);
          } else {
            throw new Error('No valid items found');
          }
        } else {
          throw new Error('Could not find confirmed array');
        }
      } catch (salvageError) {
        console.error('Salvage attempt failed:', salvageError);
        return NextResponse.json({ 
          error: 'The AI had trouble formatting the bell schedule data. Please try a simpler file format or a smaller file.' 
        }, { status: 500 });
      }
    }

      // Return parsed data for user review
      perf.end({ success: true });
      
      return NextResponse.json({
        success: true,
        data: parsedData,
        uploadType,
        extractionMethod,
        fileName: file.name,
      });

    } catch (error: any) {
      log.error('AI Upload error', error, { userId });
      
      track.event('ai_upload_error', {
        userId,
        error: error.message
      });
      
      perf.end({ success: false });
      
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again." },
        { status: 500 },
      );
    }
  });        

function createIntelligentSystemPrompt(
  uploadType: string,
  fileType: string,
): string {
  const basePrompt = `You are an expert AI assistant helping special education teachers save time by intelligently extracting and organizing data from their files. 

  You're processing a ${fileType} file that contains ${uploadType.replace("_", " ")} information.

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

  IMPORTANT: 
  - Return ONLY valid JSON
  - NO markdown, NO explanations, NO text before or after the JSON
  - Start your response with { and end with }
  - Ensure all arrays are properly closed with ]
  - No trailing commas in arrays or objects
  - Double-check that your JSON is valid before responding`;

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
      - "S" or "Smith" or "S. Smith" = all refer to teacher Smith
      - If only a list of names, assume standard 2x30 sessions
      - Grade might be written as "3rd grade" or "Grade 3" or just "3"`,

    bell_schedule: `
    For BELL SCHEDULE data, ONLY extract GRADE-WIDE blocking periods:
    
    PRIMARY TARGETS (almost always grade-wide):
    - Recess (morning recess, afternoon recess, snack time)
    - Lunch/Nutrition breaks
    
    ONLY INCLUDE IF EXPLICITLY GRADE-WIDE:
    - PE (only if it says "all Grade 3" or "entire 2nd grade" etc.)
    - Other activities ONLY if they clearly state the entire grade participates
    
    DO NOT INCLUDE:
    - Music, Art, Library, Computer (these are typically class-based, not grade-wide)
    - Any class-specific activities (e.g., "Mrs. Smith's class has music")
    - Regular class periods or instruction time
    - School start/dismissal times
    - One-off events or assemblies
    - Field trips or special events
    
    CRITICAL FILTERING RULES:
    1. Must be a RECURRING weekly event (not one-time)
    2. Must apply to an ENTIRE GRADE LEVEL (not individual classes)
    3. Primarily looking for RECESS and LUNCH
    4. Other activities only if explicitly stated as grade-wide

    Output format for each schedule item:
    {
      "grade_level": "K",
      "period_name": "Recess",
      "start_time": "10:00",
      "end_time": "10:15",
      "days": [1, 2, 3, 4, 5]
    }

    Smart parsing tips:
    - Convert all times to 24-hour format (e.g., "13:30" for 1:30 PM, "09:00" for 9:00 AM)
    - Always use 24-hour format without seconds (HH:MM format only)
    - "MWF" = [1,3,5], "M-F" = [1,2,3,4,5], "Daily" = [1,2,3,4,5]
    - "Transitional Kindergarten" or "TK" = "TK"
    - "Kindergarten" = "K", "First Grade" = "1"
    - Multiple grades like "1st-3rd" = "1,2,3"
    - Focus on finding patterns like "Grade 2 Lunch", "3rd Grade Recess", "TK Recess"
    - Look for both AM and PM schedules for TK/Kindergarten

    CRITICAL: Return ONLY valid JSON with NO trailing commas. Example:
    {
      "confirmed": [
        {
          "grade_level": "K",
          "period_name": "Recess",
          "start_time": "10:20",
          "end_time": "10:35",
          "days": [1, 2, 3, 4, 5]
        }
      ],
      "ambiguous": [],
      "errors": []
    }`,

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
      - Look for patterns like "Smith - PE - Mon 10-11"`,
  };

  return (
    basePrompt +
    "\n\n" +
    (typeSpecificPrompts[uploadType as keyof typeof typeSpecificPrompts] || "")
  );
}

function createUserPrompt(
  fileContent: string,
  uploadType: string,
  existingData: any,
  profile: any,
): string {
  let prompt = `Please intelligently extract ${uploadType.replace("_", " ")} data from this file:\n\n${fileContent}\n\n`;

  // Add context about existing data
  if (uploadType === "students" && existingData.students?.length > 0) {
    const teachers = [
      ...new Set(existingData.students.map((s: any) => s.teacher_name)),
    ];
    prompt += `\nContext: Existing teachers in the system include: ${teachers.join(", ")}. Try to match teacher names to these when possible.\n`;
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
