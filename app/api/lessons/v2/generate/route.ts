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

    // Validate field values
    if (![15, 30, 45, 60].includes(body.duration)) {
      return NextResponse.json(
        { error: 'Invalid duration. Must be 15, 30, 45, or 60' },
        { status: 400 }
      );
    }

    if (!['K', '1', '2', '3', '4', '5'].includes(body.grade)) {
      return NextResponse.json(
        { error: 'Invalid grade. Must be K-5' },
        { status: 400 }
      );
    }

    if (!['ela', 'math'].includes(body.subjectType)) {
      return NextResponse.json(
        { error: 'Invalid subjectType. Must be ela or math' },
        { status: 400 }
      );
    }

    const validElaTopics = ['reading-comprehension', 'phonics-decoding', 'writing-prompt', 'grammar-vocabulary'];
    const validMathTopics = ['computation', 'word-problems', 'mixed-practice'];
    const validTopics = body.subjectType === 'ela' ? validElaTopics : validMathTopics;

    if (!validTopics.includes(body.topic)) {
      return NextResponse.json(
        { error: `Invalid topic for ${body.subjectType}. Must be one of: ${validTopics.join(', ')}` },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured in environment');
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
      console.error('V2 worksheet generation failed:', {
        error: result.error,
        topic: body.topic,
        grade: body.grade,
        duration: body.duration,
        subjectType: body.subjectType,
      });
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
