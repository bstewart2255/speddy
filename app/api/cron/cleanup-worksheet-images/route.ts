import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// SPE-143: retention/TTL for worksheet-submission images (scanned student work).
// Submissions older than this are deleted along with their Storage objects.
const RETENTION_MONTHS = 12;

// storage.remove() takes an array; chunk large deletes to keep each call bounded.
const STORAGE_REMOVE_CHUNK = 100;

/**
 * GET /api/cron/cleanup-worksheet-images
 *
 * Deletes worksheet_submissions older than RETENTION_MONTHS and removes their
 * images from the private `worksheet-submissions` bucket (path stored in
 * `image_url`). Storage objects are removed first; the rows are deleted only
 * after, so a Storage failure never orphans an image behind a deleted row.
 *
 * Auth mirrors the existing cleanup cron: a shared secret in the `x-cron-secret`
 * header or `Authorization: Bearer <secret>` form, compared against CRON_SECRET.
 * Scheduling is wired by the cron provider (e.g. a vercel.json `crons` entry or
 * an external scheduler that sends the secret) — see docs/offboarding-runbook.md.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;
    const token = request.headers.get('x-cron-secret') || bearerToken;

    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
      console.error('CRON_SECRET environment variable not set');
      return NextResponse.json(
        { success: false, error: 'Server configuration error', timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    if (!token || token !== expectedToken) {
      console.warn('Unauthorized worksheet-image cleanup attempt');
      return NextResponse.json(
        { success: false, error: 'Unauthorized', timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);

    // Find expired submissions and their Storage paths.
    const { data: expired, error: selectError } = await supabase
      .from('worksheet_submissions')
      .select('id, image_url')
      .lt('submitted_at', cutoffDate.toISOString());

    if (selectError) {
      console.error('Error selecting expired worksheet submissions:', selectError);
      return NextResponse.json(
        {
          success: false,
          error: 'Database error during cleanup',
          details: selectError.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    const rows = expired ?? [];
    const paths = rows.map((r) => r.image_url).filter((p): p is string => !!p);

    // Remove Storage objects first, in bounded chunks.
    let storageRemoved = 0;
    let storageErrors = 0;
    for (let i = 0; i < paths.length; i += STORAGE_REMOVE_CHUNK) {
      const chunk = paths.slice(i, i + STORAGE_REMOVE_CHUNK);
      const { error: removeError } = await supabase.storage
        .from('worksheet-submissions')
        .remove(chunk);
      if (removeError) {
        storageErrors++;
        console.error('Error removing worksheet-submission images:', removeError);
      } else {
        storageRemoved += chunk.length;
      }
    }

    // Delete the rows.
    let rowsDeleted = 0;
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { error: deleteError, count } = await supabase
        .from('worksheet_submissions')
        .delete({ count: 'exact' })
        .in('id', ids);

      if (deleteError) {
        console.error('Error deleting expired worksheet submissions:', deleteError);
        return NextResponse.json(
          {
            success: false,
            error: 'Database error during cleanup',
            details: deleteError.message,
            timestamp: new Date().toISOString(),
          },
          { status: 500 }
        );
      }
      rowsDeleted = count ?? 0;
    }

    const processingTime = Date.now() - startTime;
    console.log(
      `Worksheet-image cleanup completed: ${rowsDeleted} rows, ${storageRemoved} images removed in ${processingTime}ms`
    );

    return NextResponse.json(
      {
        success: true,
        rowsDeleted,
        storageRemoved,
        storageErrors: storageErrors || undefined,
        retentionMonths: RETENTION_MONTHS,
        cutoffDate: cutoffDate.toISOString(),
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in worksheet-image cleanup cron job:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Unexpected error during cleanup',
        details: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility with different cron services.
export async function POST(request: NextRequest) {
  return GET(request);
}
