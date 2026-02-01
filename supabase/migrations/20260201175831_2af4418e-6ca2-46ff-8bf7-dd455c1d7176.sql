-- Phase 1: Critical indexes for 5,000 concurrent jobs scalability

-- Index for job status filtering (dashboard, job list)
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Index for user's jobs lookup
CREATE INDEX IF NOT EXISTS idx_jobs_requester_created ON jobs(requester_id, created_at DESC);

-- Partial index for running job queries (most common filter)
CREATE INDEX IF NOT EXISTS idx_jobs_status_started ON jobs(status, started_at) 
  WHERE status = 'running';

-- Index for sample time-range queries (job detail page)
CREATE INDEX IF NOT EXISTS idx_samples_job_recorded ON samples(job_id, recorded_at DESC);

-- Index for sample sequence lookups
CREATE INDEX IF NOT EXISTS idx_samples_job_sequence ON samples(job_id, sequence_number DESC);

-- Index for alerts by triggered time (replaces partial index that used NOW())
CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at DESC);