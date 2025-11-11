-- Add discarded_at timestamp fields to exit_tickets and progress_checks tables
-- These fields track when an item was discarded from the results view
-- NULL = active (visible), timestamp = discarded (hidden from default filters)

-- Add discarded_at to exit_tickets table
ALTER TABLE exit_tickets
ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ;

-- Add discarded_at to progress_checks table
ALTER TABLE progress_checks
ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ;

-- Create indexes for better query performance when filtering by discarded_at
CREATE INDEX IF NOT EXISTS idx_exit_tickets_discarded_at ON exit_tickets(discarded_at);
CREATE INDEX IF NOT EXISTS idx_progress_checks_discarded_at ON progress_checks(discarded_at);

-- Add comments for documentation
COMMENT ON COLUMN exit_tickets.discarded_at IS 'Timestamp when the exit ticket was discarded from results view. NULL means active, timestamp means discarded.';
COMMENT ON COLUMN progress_checks.discarded_at IS 'Timestamp when the progress check was discarded from results view. NULL means active, timestamp means discarded.';
