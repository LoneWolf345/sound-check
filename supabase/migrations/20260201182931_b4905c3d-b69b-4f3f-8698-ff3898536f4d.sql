-- Add summary metrics columns to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS avg_rtt_ms NUMERIC;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS packet_loss_percent NUMERIC;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_samples INTEGER DEFAULT 0;

-- Index for sorting by metrics
CREATE INDEX IF NOT EXISTS idx_jobs_packet_loss ON jobs(packet_loss_percent) 
  WHERE packet_loss_percent IS NOT NULL;