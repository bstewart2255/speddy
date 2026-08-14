import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/with-route';
import { readCappedFormData, BodyTooLargeError, BODY_LIMITS } from '@/lib/api/body-limit';
import { createClient } from '@/lib/supabase/server';
import {
  extractAccommodationsFromPdf,
  AccommodationExtractionError,
  MAX_PDF_BYTES,
} from '@/lib/iep/extract-accommodations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Reading a multi-page IEP through Claude can exceed the platform default
// timeout. Requires platform support (same as submit-worksheet).
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/students/[studentId]/extract-accommodations (SPE-489)
 *
 * Accepts one IEP PDF as multipart form data, proposes an accommodations list
 * extracted by Claude, and returns it for the provider to review. Deliberately
 * writes nothing: the PDF is never stored anywhere, and the accommodations only
 * reach the database if the provider approves them and saves the student
 * details form (the existing, RLS-covered write path).
 */
export const POST = withRoute<{ studentId: string }>(
  {
    aiGated: true,
    // Each call is a paid multi-page document read — cap spend per user and
    // deny (not allow) if the limiter itself is down.
    rateLimit: {
      requests: 20,
      windowSeconds: 3600,
      name: 'extract-accommodations',
      failClosed: true,
    },
  },
  async ({ req, userId, params }) => {
    const { studentId } = params;
    if (!UUID_RE.test(studentId)) {
      return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
    }

    // Owning provider only — the roles that can actually save accommodations.
    // A bare "session can read the student" check would let every teacher,
    // SEA, and admin who can view the student burn paid extraction calls.
    // The user-scoped client keeps RLS in the loop as well.
    const supabase = await createClient();
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .eq('provider_id', userId)
      .maybeSingle();
    if (studentError || !student) {
      return NextResponse.json(
        { error: 'Student not found or access denied' },
        { status: 404 }
      );
    }

    let formData: FormData;
    try {
      // Capped read (SPE-505): the MAX_PDF_BYTES check below only runs once the
      // whole body is already buffered in memory.
      formData = await readCappedFormData(req, BODY_LIMITS.extractAccommodations);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        // Same message the in-handler size check gives, so the two paths read
        // identically to the user; that check keeps its original 400.
        return NextResponse.json(
          { error: 'PDF is too large. The limit is 4MB — try the shorter "IEP at a Glance" instead of the full IEP.' },
          { status: 413 }
        );
      }
      return NextResponse.json({ error: 'Expected a file upload' }, { status: 400 });
    }

    // Duck-typed rather than `instanceof File`: the parsed entry comes from the
    // fetch runtime's own File class, which is a different constructor than the
    // ambient global in some runtimes (and in tests).
    const file = formData.get('file') as Blob | string | null;
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || file.size === 0) {
      return NextResponse.json({ error: 'Attach a PDF file to import' }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: 'PDF is too large. The limit is 4MB — try the shorter "IEP at a Glance" instead of the full IEP.' },
        { status: 400 }
      );
    }

    const pdf = Buffer.from(await file.arrayBuffer());
    // Magic-byte check: every real PDF starts with "%PDF-". Cheaper and more
    // reliable than trusting the client-supplied extension or MIME type.
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      return NextResponse.json(
        { error: 'That file is not a PDF. Upload the IEP as a PDF file.' },
        { status: 400 }
      );
    }

    try {
      const accommodations = await extractAccommodationsFromPdf(pdf);
      return NextResponse.json({ accommodations });
    } catch (error) {
      if (error instanceof AccommodationExtractionError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error; // withRoute logs and returns a generic 500
    }
  }
);
