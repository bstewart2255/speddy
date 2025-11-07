import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { validateDocumentFile, generateSafeFilename } from '@/lib/document-utils';

// GET - Fetch all documents for a session
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ sessionId: string }> }
) {
  const perf = measurePerformanceWithAlerts('get_session_documents', 'api');
  const params = await props.params;
  const { sessionId } = params;
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

    log.info('Fetching session documents', {
      userId,
      sessionId
    });

    // Verify user has access to this session
    const { data: sessionData, error: accessError } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('id', sessionId)
      .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
      .limit(1)
      .single();

    if (accessError || !sessionData) {
      log.warn('User does not have access to session', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Fetch documents for the session
    const fetchPerf = measurePerformanceWithAlerts('fetch_session_documents_db', 'database');
    const { data: documents, error } = await supabase
      .from('session_documents')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    fetchPerf.end({ success: !error, count: documents?.length || 0 });

    if (error) {
      log.error('Error fetching session documents', error, {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    log.info('Session documents fetched successfully', {
      userId,
      sessionId,
      documentCount: documents?.length || 0
    });

    track.event('session_documents_fetched', {
      userId,
      sessionId,
      count: documents?.length || 0
    });

    perf.end({ success: true, count: documents?.length || 0 });
    return NextResponse.json({ documents: documents || [] });
  } catch (error) {
    log.error('Error in get-session-documents route', error, { userId, sessionId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new document for a session
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ sessionId: string }> }
) {
  const perf = measurePerformanceWithAlerts('create_session_document', 'api');
  const params = await props.params;
  const { sessionId } = params;
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

    // Verify user has access to this session BEFORE processing any file uploads
    const { data: sessionData, error: accessError } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('id', sessionId)
      .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
      .limit(1)
      .single();

    if (accessError || !sessionData) {
      log.warn('User does not have access to session', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Detect content type
    const contentType = request.headers.get('content-type') || '';
    const isFormData = contentType.includes('multipart/form-data');

    let title, document_type, content, url, file_path, mime_type, file_size, original_filename;

    if (isFormData) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      title = formData.get('title') as string | null;
      document_type = formData.get('document_type') as string | null;

      if (!file) {
        perf.end({ success: false });
        return NextResponse.json({ error: 'File is required' }, { status: 400 });
      }

      if (!title) {
        perf.end({ success: false });
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      }

      // Validate file
      const validation = validateDocumentFile(file);
      if (!validation.valid) {
        perf.end({ success: false });
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      // Generate safe filename
      const timestamp = Date.now();
      const safeFilename = generateSafeFilename(file.name);
      const storagePath = `sessions/${sessionId}/${timestamp}-${safeFilename}`;

      // Convert file to buffer
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Upload to Supabase Storage
      const uploadPerf = measurePerformanceWithAlerts('upload_session_document_storage', 'storage');
      const { error: uploadError } = await supabase.storage
        .from('session-documents')
        .upload(storagePath, buffer, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false
        });

      try {
        uploadPerf.end({ success: !uploadError });
      } catch (perfError) {
        console.error('Performance monitoring error (non-critical):', perfError);
      }

      if (uploadError) {
        log.error('Error uploading file to storage', uploadError, {
          userId,
          sessionId,
          filename: file.name,
          errorMessage: uploadError.message,
          errorDetails: uploadError
        });
        try {
          perf.end({ success: false });
        } catch (perfError) {
          console.error('Performance monitoring error (non-critical):', perfError);
        }
        return NextResponse.json(
          { error: `Failed to upload file: ${uploadError.message}` },
          { status: 500 }
        );
      }

      file_path = storagePath;
      mime_type = file.type;
      file_size = file.size;
      original_filename = file.name;
      document_type = 'file';

      log.info('File uploaded successfully', {
        userId,
        sessionId,
        file_path,
        mime_type,
        file_size
      });
    } else {
      // Handle JSON request (links)
      const body = await request.json();
      title = body.title;
      document_type = body.document_type;
      content = body.content;
      url = body.url;
      file_path = body.file_path;

      // Validate required fields
      if (!title || !document_type) {
        perf.end({ success: false });
        return NextResponse.json(
          { error: 'Title and document_type are required' },
          { status: 400 }
        );
      }

      // Validate document_type
      if (!['pdf', 'link', 'note', 'file'].includes(document_type)) {
        perf.end({ success: false });
        return NextResponse.json(
          { error: 'Invalid document_type. Must be one of: pdf, link, note, file' },
          { status: 400 }
        );
      }

      // Per-type validations
      if (document_type === 'note' && !content) {
        perf.end({ success: false });
        return NextResponse.json({ error: 'content is required for notes' }, { status: 400 });
      }
      if (document_type === 'link') {
        if (!url) {
          perf.end({ success: false });
          return NextResponse.json({ error: 'url is required for links' }, { status: 400 });
        }
        try {
          const u = new URL(url);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            perf.end({ success: false });
            return NextResponse.json({ error: 'Only http(s) URLs are allowed' }, { status: 400 });
          }
        } catch {
          perf.end({ success: false });
          return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
        }
      }
    }

    log.info('Creating session document', {
      userId,
      sessionId,
      title,
      document_type
    });

    // Create the document
    const createPerf = measurePerformanceWithAlerts('create_session_document_db', 'database');
    const { data, error } = await supabase
      .from('session_documents')
      .insert({
        session_id: sessionId,
        title,
        document_type,
        content: content || null,
        url: url || null,
        file_path: file_path || null,
        mime_type: mime_type || null,
        file_size: file_size || null,
        original_filename: original_filename || null,
        created_by: userId
      })
      .select('*')
      .single();
    createPerf.end({ success: !error });

    if (error) {
      log.error('Error creating session document', error, {
        userId,
        sessionId,
        title
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to create document' },
        { status: 500 }
      );
    }

    log.info('Session document created successfully', {
      userId,
      sessionId,
      documentId: data.id,
      title
    });

    track.event('session_document_created', {
      userId,
      sessionId,
      documentId: data.id,
      document_type
    });

    perf.end({ success: true, documentId: data.id });
    return NextResponse.json({ document: data }, { status: 201 });
  } catch (error) {
    log.error('Error in create-session-document route', error, { userId, sessionId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a document
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ sessionId: string }> }
) {
  const perf = measurePerformanceWithAlerts('delete_session_document', 'api');
  const params = await props.params;
  const { sessionId } = params;
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

    const searchParams = request.nextUrl.searchParams;
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'documentId query parameter is required' },
        { status: 400 }
      );
    }

    log.info('Deleting session document', {
      userId,
      sessionId,
      documentId
    });

    // Delete the document (RLS will ensure user owns it)
    const deletePerf = measurePerformanceWithAlerts('delete_session_document_db', 'database');
    const { error } = await supabase
      .from('session_documents')
      .delete()
      .eq('id', documentId)
      .eq('session_id', sessionId)
      .eq('created_by', userId); // Ensure user owns the document
    deletePerf.end({ success: !error });

    if (error) {
      log.error('Error deleting session document', error, {
        userId,
        sessionId,
        documentId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      );
    }

    log.info('Session document deleted successfully', {
      userId,
      sessionId,
      documentId
    });

    track.event('session_document_deleted', {
      userId,
      sessionId,
      documentId
    });

    perf.end({ success: true, documentId });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in delete-session-document route', error, { userId, sessionId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
