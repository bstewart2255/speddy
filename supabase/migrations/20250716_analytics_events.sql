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
CREATE INDEX idx_analytics_events_event ON analytics_events(event);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX idx_analytics_events_worksheet_code ON analytics_events(worksheet_code);
CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_event_created ON analytics_events(event, created_at DESC);

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

-- Create a view for upload analytics summary
CREATE OR REPLACE VIEW upload_analytics_summary AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  event,
  COUNT(*) as count,
  AVG(processing_time) as avg_processing_time,
  AVG(file_size) as avg_file_size,
  COUNT(DISTINCT worksheet_code) as unique_worksheets,
  COUNT(DISTINCT user_id) as unique_users
FROM analytics_events
WHERE event IN (
  'qr_upload_completed', 
  'qr_upload_failed',
  'standard_upload_completed',
  'standard_upload_failed'
)
GROUP BY DATE_TRUNC('day', created_at), event
ORDER BY date DESC, event;