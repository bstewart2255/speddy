# Analytics Setup Instructions

If you're seeing an error on the Analytics page, it's likely because the analytics_events table hasn't been created yet.

## Quick Fix

Run the following SQL in your Supabase SQL editor:

```sql
-- Create analytics_events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event VARCHAR(100) NOT NULL,
  worksheet_code VARCHAR(50),
  device_type VARCHAR(20),
  method VARCHAR(20),
  file_size INTEGER,
  processing_time INTEGER,
  upload_source VARCHAR(50),
  error_code VARCHAR(50),
  error_message TEXT,
  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_worksheet_code ON analytics_events(worksheet_code);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created ON analytics_events(event, created_at DESC);

-- Add RLS policies
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy for service role to insert events
CREATE POLICY "Service role can insert analytics" ON analytics_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy for authenticated users to view their own analytics
CREATE POLICY "Users can view their own analytics" ON analytics_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy for service role to view all analytics
CREATE POLICY "Service role can view all analytics" ON analytics_events
  FOR SELECT
  TO service_role
  USING (true);
```

## Using Supabase CLI

If you have the Supabase CLI installed:

```bash
# Apply all migrations
supabase db push

# Or run specific migration
supabase migration up --file supabase/migrations/20250716_analytics_events.sql
```

## Verify Setup

After creating the table, you can verify it's working:

1. Navigate to the Analytics page: `/dashboard/analytics`
2. It should now show empty analytics (0 uploads)
3. Perform a QR scan upload to generate some data
4. Refresh the analytics page to see the data

## Troubleshooting

### Still seeing errors?

1. Check browser console for specific error messages
2. Verify you're logged in (analytics requires authentication)
3. Check that your user role has access to analytics (currently limited to 'resource' role)
4. Try clearing browser cache and refreshing

### No data showing?

Analytics only tracks uploads made AFTER the table was created. Historical uploads won't appear in analytics.

To generate test data:
```bash
npx tsx tests/qr-upload/generate-test-data.ts
```