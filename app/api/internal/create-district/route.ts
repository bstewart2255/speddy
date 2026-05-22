import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { withRoute } from '@/lib/api/with-route';

const log = logger.child({ module: 'internal-create-district' });

export const POST = withRoute({}, async ({ req: request, userId }) => {
  try {
    // Admin (service-role) client; also used to verify the caller is a speddy admin.
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify the user is a speddy admin
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('is_speddy_admin')
      .eq('id', userId)
      .single() as unknown as { data: { is_speddy_admin: boolean } | null; error: Error | null };

    if (profileError || !profile?.is_speddy_admin) {
      log.warn('Non-speddy-admin tried to create district', { userId });
      return NextResponse.json(
        { error: 'Forbidden: Speddy admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, stateId, city, county, phone, website, mailingAddress, zip } = body as {
      name: string;
      stateId: string;
      city: string | null;
      county: string | null;
      phone: string | null;
      website: string | null;
      mailingAddress: string | null;
      zip: string | null;
    };

    // Validation
    if (!name || !stateId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, stateId' },
        { status: 400 }
      );
    }

    // Verify state exists
    const { data: state, error: stateError } = await adminClient
      .from('states')
      .select('id, name')
      .eq('id', stateId)
      .single();

    if (stateError || !state) {
      return NextResponse.json(
        { error: 'Invalid state ID' },
        { status: 400 }
      );
    }

    // Generate UUID for district
    const districtId = uuidv4();

    log.info('Creating district', {
      districtId,
      name,
      stateId,
      createdBy: userId
    });

    // Insert the district
    const { error: insertError } = await adminClient
      .from('districts')
      .insert({
        id: districtId,
        name,
        state_id: stateId,
        city,
        county,
        phone,
        website,
        mailing_address: mailingAddress,
        zip,
      });

    if (insertError) {
      log.error('Failed to create district', insertError);
      return NextResponse.json(
        { error: insertError.message || 'Failed to create district' },
        { status: 500 }
      );
    }

    log.info('District created successfully', {
      districtId,
      name,
      createdBy: userId
    });

    return NextResponse.json({
      success: true,
      districtId,
      name,
      stateId,
    });

  } catch (error) {
    log.error('Unexpected error in create-district', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
