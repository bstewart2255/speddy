import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { withRoute } from '@/lib/api/with-route';

// Cost factor for bcrypt (10 is standard, provides ~100ms hash time)
const BCRYPT_ROUNDS = 10;

// Generate a secure random API key
function generateApiKey(): string {
  const bytes = randomBytes(32);
  return `sk_live_${bytes.toString('base64url')}`;
}

// Hash the API key using bcrypt
async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

// Verify an API key against its hash
export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

// GET - List user's API keys (prefix only, not full key)
export const GET = withRoute({}, async ({ userId }) => {
  try {
    const supabase = await createClient();

    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, key_prefix, name, created_at, last_used_at, revoked_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching API keys:', error);
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }

    return NextResponse.json({ keys });
  } catch (error) {
    console.error('API keys GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST - Generate a new API key
export const POST = withRoute({}, async ({ req: request, userId }) => {
  try {
    const supabase = await createClient();

    // Parse optional name from request body
    let name = 'Chrome Extension';
    try {
      const body = await request.json();
      if (body.name) {
        name = body.name.substring(0, 50); // Limit name length
      }
    } catch {
      // No body or invalid JSON, use default name
    }

    // Generate the API key
    const fullKey = generateApiKey();
    const keyHash = await hashApiKey(fullKey);
    const keyPrefix = fullKey.substring(0, 16); // "sk_live_" + first 8 chars of random part

    // Store the hashed key
    const { data: newKey, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name,
      })
      .select('id, key_prefix, name, created_at')
      .single();

    if (error) {
      console.error('Error creating API key:', error);
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    // Return the full key ONCE - it will never be shown again
    return NextResponse.json({
      key: {
        ...newKey,
        fullKey, // Only returned on creation!
      },
      warning: 'Save this key now. It will not be shown again.',
    });
  } catch (error) {
    console.error('API keys POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

const deleteQuerySchema = z.object({
  id: z.string().min(1),
});

// DELETE - Revoke an API key
export const DELETE = withRoute({ query: deleteQuerySchema }, async ({ userId, query }) => {
  try {
    const supabase = await createClient();
    const keyId = query.id;

    // Revoke the key (soft delete)
    const { error } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId)
      .eq('user_id', userId); // Ensure user owns this key

    if (error) {
      console.error('Error revoking API key:', error);
      return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API keys DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
