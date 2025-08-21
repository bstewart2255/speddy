// app/api/ai-lessons/adjustments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adjustmentQueue } from '@/lib/ai-lessons/adjustment-queue';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'pending';

    if (view === 'high-priority') {
      // Get high priority adjustments grouped by student
      const batches = await adjustmentQueue.getHighPriorityAdjustments(5);
      
      return NextResponse.json({
        view: 'high-priority',
        batches: batches.map(batch => ({
          studentId: batch.studentId,
          adjustmentCount: batch.adjustments.length,
          recommendedAction: batch.recommendedAction,
          nextLessonModifications: batch.nextLessonModifications,
          topAdjustments: batch.adjustments.slice(0, 3).map(adj => ({
            id: adj.id,
            subject: adj.subject,
            type: adj.adjustmentType,
            priority: adj.priority,
            details: adj.adjustmentDetails
          }))
        }))
      });
    }

    // Get all pending adjustments for the teacher's students
    const { data: students } = await supabase
      .from('students')
      .select('id')
      .eq('provider_id', user.id);

    if (!students || students.length === 0) {
      return NextResponse.json({
        view: 'pending',
        adjustments: [],
        summary: {
          total: 0,
          byType: {},
          bySubject: {}
        }
      });
    }

    const studentIds = students.map(s => s.id);
    const allAdjustments = [];

    for (const studentId of studentIds) {
      const adjustments = await adjustmentQueue.getPendingAdjustments(studentId);
      allAdjustments.push(...adjustments);
    }

    // Sort by priority
    allAdjustments.sort((a, b) => b.priority - a.priority);

    // Create summary statistics
    const byType: Record<string, number> = {};
    const bySubject: Record<string, number> = {};

    for (const adj of allAdjustments) {
      byType[adj.adjustmentType] = (byType[adj.adjustmentType] || 0) + 1;
      bySubject[adj.subject] = (bySubject[adj.subject] || 0) + 1;
    }

    return NextResponse.json({
      view: 'pending',
      adjustments: allAdjustments.slice(0, 20).map(adj => ({
        id: adj.id,
        studentId: adj.studentId,
        subject: adj.subject,
        type: adj.adjustmentType,
        priority: adj.priority,
        details: adj.adjustmentDetails,
        createdAt: adj.createdAt
      })),
      summary: {
        total: allAdjustments.length,
        byType,
        bySubject
      }
    });

  } catch (error: any) {
    console.error('Error fetching adjustments:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch adjustments',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, adjustmentIds } = body;

    if (action === 'process') {
      if (!adjustmentIds || !Array.isArray(adjustmentIds)) {
        return NextResponse.json(
          { error: 'Adjustment IDs are required' },
          { status: 400 }
        );
      }

      const processed = await adjustmentQueue.processBatch(adjustmentIds);
      
      return NextResponse.json({
        success: true,
        processed,
        message: `Processed ${processed} adjustments`
      });
    }

    if (action === 'cleanup') {
      const daysOld = body.daysOld || 30;
      const deleted = await adjustmentQueue.cleanupOldProcessedAdjustments(daysOld);
      
      return NextResponse.json({
        success: true,
        deleted,
        message: `Cleaned up ${deleted} old adjustments`
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Error processing adjustments:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process adjustments',
        details: error.message 
      },
      { status: 500 }
    );
  }
}