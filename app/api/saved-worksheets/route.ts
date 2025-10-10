import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { log } from '@/lib/monitoring/logger';

// GET: Fetch user's saved worksheets
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const supabase = await createClient();

    log.info('Fetching saved worksheets for user', { userId });

    const { data: worksheets, error } = await supabase
      .from('saved_worksheets')
      .select('*')
      .eq('provider_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      log.error('Failed to fetch saved worksheets from Supabase', error, {
        userId,
        errorMessage: error.message
      });
      return NextResponse.json(
        { error: 'Failed to fetch saved worksheets' },
        { status: 500 }
      );
    }

    log.info('Successfully fetched saved worksheets', {
      userId,
      count: worksheets?.length || 0
    });

    return NextResponse.json(worksheets || []);
  } catch (error) {
    log.error('Error in GET /api/saved-worksheets', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// POST: Upload and save new worksheet
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const supabase = await createClient();
    const formData = await request.formData();

    const title = formData.get('title') as string;
    const file = formData.get('file') as File;

    // Validate required fields
    if (!title || !file) {
      return NextResponse.json(
        { error: 'Missing required fields: title and file' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF and DOC files are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Determine file type for storage
    let fileType = 'pdf';
    if (file.type === 'application/msword') {
      fileType = 'doc';
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      fileType = 'docx';
    }

    // Sanitize filename to prevent path traversal: separate base name and extension
    const originalName = file.name;
    const lastDotIndex = originalName.lastIndexOf('.');
    let baseName = lastDotIndex !== -1 ? originalName.substring(0, lastDotIndex) : originalName;
    let extension = lastDotIndex !== -1 ? originalName.substring(lastDotIndex) : '';

    // Only allow alphanumeric, hyphens, and underscores in base name
    baseName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Validate and restrict extension to known safe values
    const lowerExtension = extension.toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(lowerExtension)) {
      extension = '.pdf'; // Default to .pdf if invalid
    } else {
      extension = lowerExtension;
    }

    const sanitizedFileName = baseName + extension;

    // Create unique file path: userId/timestamp-filename
    const timestamp = Date.now();
    const filePath = `${userId}/${timestamp}-${sanitizedFileName}`;

    // Upload file to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('saved-worksheets')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      log.error('Failed to upload file to storage', uploadError, {
        userId,
        fileName: file.name
      });
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      );
    }

    // Save worksheet metadata to database
    const { data: worksheet, error: dbError } = await supabase
      .from('saved_worksheets')
      .insert({
        provider_id: userId,
        title,
        file_path: filePath,
        file_type: fileType,
        file_size: file.size
      })
      .select()
      .single();

    if (dbError) {
      // If database insert fails, try to clean up the uploaded file
      await supabase.storage
        .from('saved-worksheets')
        .remove([filePath]);

      log.error('Failed to save worksheet metadata', dbError, { userId });
      return NextResponse.json(
        { error: 'Failed to save worksheet', details: dbError.message },
        { status: 500 }
      );
    }

    log.info('Worksheet uploaded successfully', {
      userId,
      worksheetId: worksheet.id,
      fileName: file.name,
      fileSize: file.size
    });

    return NextResponse.json(worksheet, { status: 201 });
  } catch (error) {
    log.error('Error in POST /api/saved-worksheets', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
