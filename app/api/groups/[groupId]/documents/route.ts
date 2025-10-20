import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

// GET - Fetch all documents for a group
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ groupId: string }> }
) {
  const perf = measurePerformanceWithAlerts('get_group_documents', 'api');
  const params = await props.params;
  const { groupId } = params;
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

    log.info('Fetching group documents', {
      userId,
      groupId
    });

    // Verify user has access to this group
    const { data: groupSessions, error: accessError } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('group_id', groupId)
      .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
      .limit(1);

    if (accessError || !groupSessions || groupSessions.length === 0) {
      log.warn('User does not have access to group', {
        userId,
        groupId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Fetch documents for the group
    const fetchPerf = measurePerformanceWithAlerts('fetch_group_documents_db', 'database');
    const { data: documents, error } = await supabase
      .from('group_documents')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    fetchPerf.end({ success: !error, count: documents?.length || 0 });

    if (error) {
      log.error('Error fetching group documents', error, {
        userId,
        groupId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    log.info('Group documents fetched successfully', {
      userId,
      groupId,
      documentCount: documents?.length || 0
    });

    track.event('group_documents_fetched', {
      userId,
      groupId,
      count: documents?.length || 0
    });

    perf.end({ success: true, count: documents?.length || 0 });
    return NextResponse.json({ documents: documents || [] });
  } catch (error) {
    log.error('Error in get-group-documents route', error, { userId, groupId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new document for a group
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ groupId: string }> }
) {
  const perf = measurePerformanceWithAlerts('create_group_document', 'api');
  const params = await props.params;
  const { groupId } = params;
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

    const body = await request.json();
    const { title, document_type, content, url, file_path } = body;

    // Validate required fields
    if (!title || !document_type) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Title and document_type are required' },
        { status: 400 }
      );
    }

    // Validate document_type
    if (!['pdf', 'link', 'note'].includes(document_type)) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Invalid document_type. Must be one of: pdf, link, note' },
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

    log.info('Creating group document', {
      userId,
      groupId,
      title,
      document_type
    });

    // Verify user has access to this group
    const { data: groupSessions, error: accessError } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('group_id', groupId)
      .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
      .limit(1);

    if (accessError || !groupSessions || groupSessions.length === 0) {
      log.warn('User does not have access to group', {
        userId,
        groupId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Create the document
    const createPerf = measurePerformanceWithAlerts('create_group_document_db', 'database');
    const { data, error } = await supabase
      .from('group_documents')
      .insert({
        group_id: groupId,
        title,
        document_type,
        content: content || null,
        url: url || null,
        file_path: file_path || null,
        created_by: userId
      })
      .select('*')
      .single();
    createPerf.end({ success: !error });

    if (error) {
      log.error('Error creating group document', error, {
        userId,
        groupId,
        title
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to create document' },
        { status: 500 }
      );
    }

    log.info('Group document created successfully', {
      userId,
      groupId,
      documentId: data.id,
      title
    });

    track.event('group_document_created', {
      userId,
      groupId,
      documentId: data.id,
      document_type
    });

    perf.end({ success: true, documentId: data.id });
    return NextResponse.json({ document: data }, { status: 201 });
  } catch (error) {
    log.error('Error in create-group-document route', error, { userId, groupId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update an existing document
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ groupId: string }> }
) {
  const perf = measurePerformanceWithAlerts('update_group_document', 'api');
  const params = await props.params;
  const { groupId } = params;
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

    const body = await request.json();
    const { documentId, title, content, url, file_path } = body;

    if (!documentId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    log.info('Updating group document', {
      userId,
      groupId,
      documentId,
      title
    });

    // Build update object with only provided fields
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (url !== undefined) {
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
      updateData.url = url;
    }
    if (file_path !== undefined) updateData.file_path = file_path;

    // Update the document (RLS will ensure user owns it)
    const updatePerf = measurePerformanceWithAlerts('update_group_document_db', 'database');
    const { data, error } = await supabase
      .from('group_documents')
      .update(updateData)
      .eq('id', documentId)
      .eq('group_id', groupId)
      .eq('created_by', userId) // Ensure user owns the document
      .select('*')
      .single();
    updatePerf.end({ success: !error });

    if (error) {
      log.error('Error updating group document', error, {
        userId,
        groupId,
        documentId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to update document' },
        { status: 500 }
      );
    }

    if (!data) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    log.info('Group document updated successfully', {
      userId,
      groupId,
      documentId
    });

    track.event('group_document_updated', {
      userId,
      groupId,
      documentId
    });

    perf.end({ success: true, documentId });
    return NextResponse.json({ document: data });
  } catch (error) {
    log.error('Error in update-group-document route', error, { userId, groupId });
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
  props: { params: Promise<{ groupId: string }> }
) {
  const perf = measurePerformanceWithAlerts('delete_group_document', 'api');
  const params = await props.params;
  const { groupId } = params;
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

    log.info('Deleting group document', {
      userId,
      groupId,
      documentId
    });

    // Delete the document (RLS will ensure user owns it)
    const deletePerf = measurePerformanceWithAlerts('delete_group_document_db', 'database');
    const { error } = await supabase
      .from('group_documents')
      .delete()
      .eq('id', documentId)
      .eq('group_id', groupId)
      .eq('created_by', userId); // Ensure user owns the document
    deletePerf.end({ success: !error });

    if (error) {
      log.error('Error deleting group document', error, {
        userId,
        groupId,
        documentId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      );
    }

    log.info('Group document deleted successfully', {
      userId,
      groupId,
      documentId
    });

    track.event('group_document_deleted', {
      userId,
      groupId,
      documentId
    });

    perf.end({ success: true, documentId });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in delete-group-document route', error, { userId, groupId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
