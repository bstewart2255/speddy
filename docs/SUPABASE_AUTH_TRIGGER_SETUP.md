# Supabase Auth Trigger Setup Guide

Due to Supabase's security model, you cannot create triggers directly on the `auth.users` table. This guide provides alternative approaches to automatically create profiles when users sign up.

## Option 1: Database Webhook (Recommended for Supabase)

Supabase provides Database Webhooks that can listen to changes in the auth schema. Here's how to set it up:

### Via Supabase Dashboard:

1. Go to your Supabase project dashboard
2. Navigate to **Database → Webhooks**
3. Click **"Create a new webhook"**
4. Configure as follows:
   - **Name**: `create-profile-on-signup`
   - **Table**: `auth.users`
   - **Events**: Select `INSERT`
   - **Type**: Choose `Supabase Edge Function`
   - **Edge Function**: Create a new function or select existing

### Edge Function Code:

Create a new Edge Function named `handle-new-user`:

```typescript
// supabase/functions/handle-new-user/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const { record } = await req.json()
    
    if (!record) {
      return new Response('No record provided', { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create profile
    const { error } = await supabase
      .from('profiles')
      .insert({
        id: record.id,
        email: record.email,
        full_name: record.raw_user_meta_data?.full_name || '',
        role: record.raw_user_meta_data?.role || 'resource',
        school_district: record.raw_user_meta_data?.school_district || '',
        school_site: record.raw_user_meta_data?.school_site || '',
        works_at_multiple_schools: record.raw_user_meta_data?.works_at_multiple_schools || false,
        district_domain: record.email.split('@')[1],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Error creating profile:', error)
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Profile created successfully', { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

## Option 2: Application-Level Handling (Currently Implemented)

The current implementation handles profile creation in the API route:

```typescript
// app/api/auth/signup/route.ts
// After successful auth signup:
const { error: profileError } = await supabase
  .from('profiles')
  .insert({
    id: signUpData.user.id,
    email: signUpData.user.email!,
    full_name: metadata.full_name,
    role: metadata.role,
    school_district: metadata.school_district,
    school_site: metadata.school_site,
    works_at_multiple_schools: metadata.works_at_multiple_schools || false,
    district_domain: emailDomain,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
```

## Option 3: PostgreSQL Function with RPC (Alternative)

Since we can't create triggers on auth.users, we can use the function created in the migration:

```sql
-- Call this function from your application after signup
SELECT public.create_profile_for_new_user(
  'user-uuid',
  'user@email.com',
  '{"full_name": "John Doe", "role": "resource", ...}'::jsonb
);
```

In your application:

```typescript
// After successful signup
const { error } = await supabase.rpc('create_profile_for_new_user', {
  user_id: signUpData.user.id,
  user_email: signUpData.user.email,
  user_metadata: {
    full_name: metadata.full_name,
    role: metadata.role,
    school_district: metadata.school_district,
    school_site: metadata.school_site,
    works_at_multiple_schools: metadata.works_at_multiple_schools
  }
});
```

## Current Setup

The application currently uses **Option 2** (Application-Level Handling) which:
- ✅ Works without special database permissions
- ✅ Provides immediate feedback if profile creation fails
- ✅ Allows for custom error handling
- ✅ Ensures referral codes are generated for teachers

The referral code generation still happens automatically via the database trigger on the `profiles` table, which works correctly.

## Migration Order

Run the migrations in this order:
1. `20250117_create_profile_on_signup.sql` - Creates the helper function
2. `20250117_auto_generate_referral_codes.sql` - Creates the referral code trigger

Both migrations will work without superuser permissions.