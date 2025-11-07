import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

// GET - Generate download URL for a document
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const perf = measurePerformanceWithAlerts('download_document', 'api');
  const params = await props.params;
  const { documentId } = params;
  let userId: string | undefined;

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    log.info('Fetching document for download', {
      userId,
      documentId
    });

    // Fetch document from unified documents table
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      log.warn('Document not found', {
        userId,
        documentId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Verify user has access based on documentable_type
    let hasAccess = false;

    if (document.documentable_type === 'session') {
      // Check if user has access to this session
      const { data: sessionData, error: accessError } = await supabase
        .from('schedule_sessions')
        .select('id')
        .eq('id', document.documentable_id)
        .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
        .single();

      hasAccess = !accessError && !!sessionData;
    } else if (document.documentable_type === 'group') {
      // Check if user has access to any session in this group
      const { data: groupSessions, error: accessError } = await supabase
        .from('schedule_sessions')
        .select('id')
        .eq('group_id', document.documentable_id)
        .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
        .limit(1);

      hasAccess = !accessError && groupSessions && groupSessions.length > 0;
    }

    if (!hasAccess) {
      log.warn('User does not have access to document', {
        userId,
        documentId,
        documentableType: document.documentable_type,
        documentableId: document.documentable_id
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Handle different document types
    if (document.document_type === 'link') {
      // For links, return the URL directly
      log.info('Link document accessed', {
        userId,
        documentId,
        url: document.url
      });

      track.event('document_accessed', {
        userId,
        documentId,
        documentType: 'link'
      });

      perf.end({ success: true });
      return NextResponse.json({
        type: 'link',
        url: document.url
      });
    } else if ((document.document_type === 'file' || document.document_type === 'pdf') && document.file_path) {
      // For files and legacy PDFs, generate signed URL from storage
      // Try new unified bucket first
      let { data: signedUrlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(document.file_path, 3600); // 1 hour expiry

      // If file not found and path doesn't have new prefix, try legacy bucket
      if (urlError && !document.file_path.startsWith('groups/') && !document.file_path.startsWith('sessions/')) {
        log.info('File not found in unified bucket, trying legacy bucket', {
          userId,
          documentId,
          filePath: document.file_path,
          documentableType: document.documentable_type
        });

        // Determine which legacy bucket to use
        const legacyBucket = document.documentable_type === 'group' ? 'group-documents' : 'session-documents';

        // Try legacy bucket
        const legacyResult = await supabase.storage
          .from(legacyBucket)
          .createSignedUrl(document.file_path, 3600);

        signedUrlData = legacyResult.data;
        urlError = legacyResult.error;

        if (!urlError && signedUrlData) {
          log.info('Successfully fetched from legacy bucket', {
            userId,
            documentId,
            legacyBucket
          });
        }
      }

      if (urlError || !signedUrlData) {
        log.error('Error generating signed URL', urlError, {
          userId,
          documentId,
          filePath: document.file_path
        });
        perf.end({ success: false });
        return NextResponse.json(
          { error: 'Failed to generate download URL' },
          { status: 500 }
        );
      }

      log.info('File document download URL generated', {
        userId,
        documentId,
        filePath: document.file_path
      });

      track.event('document_downloaded', {
        userId,
        documentId,
        documentType: 'file',
        mimeType: document.mime_type,
        fileSize: document.file_size
      });

      perf.end({ success: true });
      return NextResponse.json({
        type: 'file',
        url: signedUrlData.signedUrl,
        filename: document.original_filename || 'download'
      });
    } else {
      // Unsupported document type or missing file path
      log.warn('Unsupported document type or missing file path', {
        userId,
        documentId,
        documentType: document.document_type
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Cannot generate download URL for this document type' },
        { status: 400 }
      );
    }
  } catch (error) {
    log.error('Error in download-document route', error, { userId, documentId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
