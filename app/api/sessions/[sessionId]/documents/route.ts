import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
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

  // Get session_date from query params (optional - if provided, filter documents for specific date)
  const searchParams = request.nextUrl.searchParams;
  const sessionDate = searchParams.get('session_date');

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    // Handle temporary session IDs (unsaved sessions)
    if (sessionId.startsWith('temp-')) {
      log.info('Temporary session - returning empty documents', {
        userId,
        sessionId
      });
      perf.end({ success: true, count: 0 });
      return NextResponse.json({ documents: [] });
    }

    log.info('Fetching session documents', {
      userId,
      sessionId,
      sessionDate: sessionDate || 'all dates'
    });

    // Verify user has access to this session using service client to bypass RLS
    let sessionData;
    let accessError;
    try {
      const serviceClient = createServiceClient();
      const result = await serviceClient
        .from('schedule_sessions')
        .select('id, provider_id, assigned_to_specialist_id, assigned_to_sea_id')
        .eq('id', sessionId);
      sessionData = result.data;
      accessError = result.error;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      log.error('Error creating service client or fetching session', { error: errorMessage, userId, sessionId });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Internal server error', details: errorMessage },
        { status: 500 }
      );
    }

    if (accessError) {
      log.error('Error fetching session', accessError, {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Database error', details: accessError.message },
        { status: 500 }
      );
    }

    if (!sessionData || sessionData.length === 0) {
      log.warn('Session not found', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const session = sessionData[0];

    // Check if user has access to this session
    const hasAccess = (
      session.provider_id === userId ||
      session.assigned_to_specialist_id === userId ||
      session.assigned_to_sea_id === userId
    );

    if (!hasAccess) {
      log.warn('User does not have access to session', {
        userId,
        sessionId,
        provider_id: session.provider_id,
        assigned_to_specialist_id: session.assigned_to_specialist_id,
        assigned_to_sea_id: session.assigned_to_sea_id
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Fetch documents for the session using service client to bypass RLS
    // If session_date is provided, only return documents for that specific date
    const fetchPerf = measurePerformanceWithAlerts('fetch_session_documents_db', 'database');
    const serviceClient = createServiceClient();
    let query = serviceClient
      .from('documents')
      .select('*')
      .eq('documentable_type', 'session')
      .eq('documentable_id', sessionId);

    // Filter by session_date if provided
    if (sessionDate) {
      query = query.eq('session_date', sessionDate);
    }

    const { data: documents, error } = await query.order('created_at', { ascending: false });
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

    // Handle temporary session IDs (unsaved sessions)
    if (sessionId.startsWith('temp-')) {
      log.warn('Cannot add documents to temporary session', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Cannot add documents to unsaved sessions. Please save the session first.' },
        { status: 400 }
      );
    }

    // Verify user has access to this session BEFORE processing any file uploads
    // Using service client to bypass RLS and do our own access checking
    let sessionData;
    let accessError;
    try {
      const serviceClient = createServiceClient();
      const result = await serviceClient
        .from('schedule_sessions')
        .select('id, provider_id, assigned_to_specialist_id, assigned_to_sea_id')
        .eq('id', sessionId);
      sessionData = result.data;
      accessError = result.error;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      log.error('Error creating service client or fetching session', { error: errorMessage, userId, sessionId });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Internal server error', details: errorMessage },
        { status: 500 }
      );
    }

    if (accessError) {
      log.error('Error fetching session', accessError, {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Database error', details: accessError.message },
        { status: 500 }
      );
    }

    if (!sessionData || sessionData.length === 0) {
      log.warn('Session not found', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const session = sessionData[0];

    // Check if user has access to this session
    const hasAccess = (
      session.provider_id === userId ||
      session.assigned_to_specialist_id === userId ||
      session.assigned_to_sea_id === userId
    );

    if (!hasAccess) {
      log.warn('User does not have access to session', {
        userId,
        sessionId,
        provider_id: session.provider_id,
        assigned_to_specialist_id: session.assigned_to_specialist_id,
        assigned_to_sea_id: session.assigned_to_sea_id
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

    let title, document_type, content, url, file_path, mime_type, file_size, original_filename, session_date;

    if (isFormData) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      title = formData.get('title') as string | null;
      document_type = formData.get('document_type') as string | null;
      session_date = formData.get('session_date') as string | null;

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

      // Upload to unified Supabase Storage bucket
      const uploadPerf = measurePerformanceWithAlerts('upload_session_document_storage', 'storage');
      const { error: uploadError } = await supabase.storage
        .from('documents')
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
      session_date = body.session_date;

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
      document_type,
      sessionDate: session_date || 'no date (shared)'
    });

    // Create the document in unified table
    const createPerf = measurePerformanceWithAlerts('create_session_document_db', 'database');
    const { data, error } = await supabase
      .from('documents')
      .insert({
        documentable_type: 'session',
        documentable_id: sessionId,
        title,
        document_type,
        content: content || null,
        url: url || null,
        file_path: file_path || null,
        mime_type: mime_type || null,
        file_size: file_size || null,
        original_filename: original_filename || null,
        created_by: userId,
        session_date: session_date || null
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

    // Handle temporary session IDs (unsaved sessions)
    if (sessionId.startsWith('temp-')) {
      log.warn('Cannot delete documents from temporary session', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Cannot delete documents from unsaved sessions.' },
        { status: 400 }
      );
    }

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

    // Delete the document from unified table (RLS will ensure user owns it)
    const deletePerf = measurePerformanceWithAlerts('delete_session_document_db', 'database');
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('documentable_type', 'session')
      .eq('documentable_id', sessionId)
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
