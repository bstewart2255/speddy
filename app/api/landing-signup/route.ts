import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Receives email captures from the marketing landing page and stores them in
// the landing_signups table. Writes use the service-role key so the table can
// stay locked down with no public RLS policies.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const raw = (body as { email?: unknown; audience?: unknown }) ?? {};
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const audience =
    raw.audience === 'provider' || raw.audience === 'admin' ? raw.audience : null;

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('landing_signups').insert({ email, audience });

    if (error) {
      console.error('landing-signup insert failed:', error.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  } catch (err) {
    console.error('landing-signup error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
