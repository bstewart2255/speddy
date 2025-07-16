-- Create table for tracking upload rate limits
CREATE TABLE upload_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address varchar(45) NOT NULL,
  worksheet_code varchar(100) NOT NULL,
  uploaded_at timestamp with time zone DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX idx_rate_limit_ip ON upload_rate_limits(ip_address, uploaded_at);
CREATE INDEX idx_rate_limit_worksheet ON upload_rate_limits(worksheet_code, uploaded_at);

-- Enable RLS
ALTER TABLE upload_rate_limits ENABLE ROW LEVEL SECURITY;

-- Create policies for rate limit table
-- Allow inserts from anyone (rate limiting happens in application)
CREATE POLICY "Allow rate limit inserts" ON upload_rate_limits
FOR INSERT WITH CHECK (true);

-- Allow selects for rate limit checks
CREATE POLICY "Allow rate limit reads" ON upload_rate_limits
FOR SELECT USING (true);

-- Allow deletes for cleanup (only for old records)
CREATE POLICY "Allow cleanup of old records" ON upload_rate_limits
FOR DELETE USING (uploaded_at < now() - interval '7 days');

-- Add comment
COMMENT ON TABLE upload_rate_limits IS 'Tracks worksheet upload attempts for rate limiting';