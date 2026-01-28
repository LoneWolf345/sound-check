-- Add monitoring_mode column to track simulated vs real polling
ALTER TABLE public.jobs ADD COLUMN monitoring_mode TEXT NOT NULL DEFAULT 'simulated';

-- Add last_ping_at column to track when the last ping was performed (for real polling scheduling)
ALTER TABLE public.jobs ADD COLUMN last_ping_at TIMESTAMPTZ;

-- Add check constraint to ensure valid monitoring mode values
ALTER TABLE public.jobs ADD CONSTRAINT jobs_monitoring_mode_check 
  CHECK (monitoring_mode IN ('simulated', 'real_polling'));