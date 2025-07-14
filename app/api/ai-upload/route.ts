// app/api/ai-upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const uploadType = formData.get("type") as string;

    console.log(
      "Processing file:",
      file?.name,
      "Type:",
      file?.type,
      "Size:",
      file?.size,
    );

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Check if file type is supported
    if (
      !SUPPORTED_TYPES.includes(file.type) &&
      !file.type.includes("wordprocessing")
    ) {
      console.log("Unsupported file type:", file.type);
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
        console.log('Processing PDF via PDF.co API...');

        const API_KEY = process.env.PDF_API_KEY;
        if (!API_KEY) {
          return NextResponse.json({ 
            error: 'PDF processing not configured. Please add PDF_API_KEY to environment variables.' 
          }, { status: 500 });
        }

        // Step 1: Upload the file to PDF.co
        console.log('Uploading file to PDF.co...');
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
        console.log('Upload result:', uploadResult);

        if (uploadResult.error || !uploadResult.url) {
          throw new Error(uploadResult.message || 'Failed to upload file');
        }

        // Step 2: Convert the uploaded file to text
        console.log('Converting PDF to text...');
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
        console.log('Convert result:', convertResult);

        if (convertResult.error === false && convertResult.body) {
          fileContent = convertResult.body;
          console.log(`PDF extracted successfully. Length: ${fileContent.length}`);
        } else {
          throw new Error(convertResult.message || 'Failed to extract text');
        }

      } catch (error: any) {
        console.error('PDF API error:', error);
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
        console.log(`Excel extracted. Length: ${fileContent.length}`);
      } catch (xlsxError) {
        console.error("Error processing Excel file:", xlsxError);
        return NextResponse.json(
          { error: "Failed to process Excel file. Please try converting to CSV." },
          { status: 500 }
        );
      }
    } {
      // Process text-based files
      extractionMethod = "Text";
      fileContent = new TextDecoder().decode(buffer);
      console.log(`Text file extracted. Length: ${fileContent.length}`);
    }
  } catch (error: any) {
    console.error("File extraction error:", error);
    return NextResponse.json(
      {
        error: `Failed to extract content from ${extractionMethod} file: ${error.message}. Please ensure the file is not corrupted or password-protected.`,
      },
      { status: 400 },
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

    // For bell schedules, limit the content to prevent token overflow
    if (uploadType === 'bell_schedule') {
      // FIRST, pre-filter content to focus on blocking periods
      console.log('Pre-filtering bell schedule content...');

      // Extract only lines that likely contain schedule information we want
      const lines = fileContent.split('\n');
      const relevantLines = lines.filter(line => {
        const lowerLine = line.toLowerCase();
        const isRelevant = (
          (lowerLine.includes('recess') || 
           lowerLine.includes('lunch') || 
           lowerLine.includes('pe') || 
           lowerLine.includes('music') || 
           lowerLine.includes('library') || 
           lowerLine.includes('art') ||
           lowerLine.includes('special') ||
           lowerLine.includes('break') ||
           lowerLine.includes('snack') ||
           lowerLine.includes('nutrition')) &&
          (lowerLine.includes(':') || lowerLine.includes('-')) // Likely has time info
        ) || 
        lowerLine.includes('grade') ||
        lowerLine.includes('class');

        // Debug log for lines containing grade 3, 4, or 5
        if (lowerLine.includes('grade 3') || lowerLine.includes('grade 4') || lowerLine.includes('grade 5')) {
          console.log(`Grade 3/4/5 line - kept: ${isRelevant} - "${line}"`);
        }

        return isRelevant;
      });

      fileContent = relevantLines.join('\n');
      console.log(`Filtered from ${lines.length} to ${relevantLines.length} relevant lines`);
      console.log('Sample of filtered content:', fileContent.substring(0, 500));

      // THEN, truncate if still too long after filtering
      if (fileContent.length > 8000) {
        console.log('Filtered content still too long, truncating...');
        fileContent = fileContent.substring(0, 8000) + '\n... [remaining content truncated for processing]';
      }
    }

    // Get user's school information
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_site, school_district")
      .eq("id", user.id)
      .single();

    // Get existing data for validation
    let existingData: any = {};

    if (uploadType === "students") {
      const { data: students } = await supabase
        .from("students")
        .select("initials, teacher_name")
        .eq("provider_id", user.id);
      existingData.students = students || [];
    } else if (uploadType === "bell_schedule") {
      const { data: schedules } = await supabase
        .from("bell_schedules")
        .select("grade_level, period_name")
        .eq("provider_id", user.id);
      existingData.schedules = schedules || [];
    } else if (uploadType === "special_activities") {
      const { data: activities } = await supabase
        .from("special_activities")
        .select("teacher_name, activity_name")
        .eq("provider_id", user.id);
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

    console.log("Sending to Claude for intelligent parsing...");

    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4000,
      temperature: 0.2, // Lower temperature for more consistent parsing
      messages: [
        { role: "user", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

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

        console.log("Successfully parsed AI response");
        console.log(
          `Results: ${parsedData.confirmed?.length || 0} confirmed, ${parsedData.ambiguous?.length || 0} ambiguous, ${parsedData.errors?.length || 0} errors`,
        );
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      console.error('Raw response:', responseText.substring(0, 500));

      // Try to salvage partial data if possible
      try {
        // Look for confirmed array content
        const confirmedMatch = responseText.match(/"confirmed"\s*:\s*\[([\s\S]*)/);
        if (confirmedMatch) {
          const content = confirmedMatch[1];
          const items: any[] = []; // Explicitly type as any array

          // Extract individual items
          const itemMatches = content.matchAll(/\{[^}]+\}/g);
          for (const match of itemMatches) {
            try {
              const item = JSON.parse(match[0]);
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
      return NextResponse.json({
        success: true,
        data: parsedData,
        uploadType,
        extractionMethod,
        fileName: file.name,
      });

    } catch (error: any) {
      console.error("AI Upload error:", error);
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again." },
        { status: 500 },
      );
    }
  }        

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
    - Common periods: Recess, Lunch, PE, Music, Library, Art
    - If a schedule applies to all weekdays, use days: [1,2,3,4,5]

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
