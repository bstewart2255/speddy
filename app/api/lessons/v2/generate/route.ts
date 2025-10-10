import { NextRequest, NextResponse } from 'next/server';
import { generateV2Worksheet } from '@/lib/lessons/v2-generator';
import type { V2GenerationRequest } from '@/lib/lessons/v2-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.topic || !body.subjectType || !body.grade || !body.duration) {
      return NextResponse.json(
        { error: 'Missing required fields: topic, subjectType, grade, duration' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Build generation request
    const generationRequest: V2GenerationRequest = {
      topic: body.topic,
      subjectType: body.subjectType,
      grade: body.grade,
      duration: body.duration,
      studentIds: body.studentIds,
      studentInitials: body.studentInitials,
    };

    // Generate worksheet
    const result = await generateV2Worksheet(generationRequest, apiKey);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Generation failed' },
        { status: 500 }
      );
    }

    // Return successful result
    return NextResponse.json(result);
  } catch (error) {
    console.error('V2 generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
