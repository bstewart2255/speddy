import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { withRoute } from '@/lib/api/with-route';

// GET: Download worksheet file
export const GET = withRoute<{ id: string }>({}, async ({ userId, params }) => {
  const supabase = await createClient();
  const { id: worksheetId } = params;

  log.info('Fetching worksheet for download', { userId, worksheetId });

  // Get worksheet metadata and verify ownership
  const { data: worksheet, error: dbError } = await supabase
    .from('saved_worksheets')
    .select('*')
    .eq('id', worksheetId)
    .eq('provider_id', userId)
    .single();

  if (dbError || !worksheet) {
    log.error('Worksheet not found or access denied', dbError, { userId, worksheetId });
    return NextResponse.json({ error: 'Worksheet not found' }, { status: 404 });
  }

  // Generate signed URL for file download (valid for 1 hour)
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from('saved-worksheets')
    .createSignedUrl(worksheet.file_path, 3600);

  if (urlError || !signedUrlData) {
    log.error('Failed to generate signed URL', urlError, {
      userId,
      worksheetId,
      filePath: worksheet.file_path
    });
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  log.info('Generated signed URL for worksheet download', { userId, worksheetId });

  return NextResponse.json({
    signedUrl: signedUrlData.signedUrl,
    worksheet
  });
});

// DELETE: Delete worksheet and file
export const DELETE = withRoute<{ id: string }>({}, async ({ userId, params }) => {
  const supabase = await createClient();
  const { id: worksheetId } = params;

  log.info('Deleting worksheet', { userId, worksheetId });

  // Get worksheet metadata and verify ownership
  const { data: worksheet, error: fetchError } = await supabase
    .from('saved_worksheets')
    .select('*')
    .eq('id', worksheetId)
    .eq('provider_id', userId)
    .single();

  if (fetchError || !worksheet) {
    log.error('Worksheet not found or access denied', fetchError, { userId, worksheetId });
    return NextResponse.json({ error: 'Worksheet not found' }, { status: 404 });
  }

  // Delete worksheet metadata from database first
  const { error: dbError } = await supabase
    .from('saved_worksheets')
    .delete()
    .eq('id', worksheetId)
    .eq('provider_id', userId);

  if (dbError) {
    log.error('Failed to delete worksheet from database', dbError, { userId, worksheetId });
    return NextResponse.json({ error: 'Failed to delete worksheet' }, { status: 500 });
  }

  // Delete file from storage
  const { error: storageError } = await supabase.storage
    .from('saved-worksheets')
    .remove([worksheet.file_path]);

  if (storageError) {
    log.error('Failed to delete file from storage', storageError, {
      userId,
      worksheetId,
      filePath: worksheet.file_path
    });
    // Log but don't fail - orphaned files can be cleaned up by a background job
  }

  log.info('Worksheet deleted successfully', { userId, worksheetId });

  return NextResponse.json({ success: true });
});
