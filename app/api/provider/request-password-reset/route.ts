import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile to check role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, password_reset_requested_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Only providers can request password resets through this endpoint
    const providerRoles = ['resource', 'speech', 'ot', 'counseling', 'sea', 'psychologist'];
    if (!providerRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only providers can request password resets through this page' },
        { status: 403 }
      );
    }

    // Check if there's already a pending request
    if (profile.password_reset_requested_at) {
      return NextResponse.json(
        { error: 'You already have a pending password reset request' },
        { status: 400 }
      );
    }

    // Set the password reset request timestamp
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ password_reset_requested_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Password reset request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
