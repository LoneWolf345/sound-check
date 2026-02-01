-- Phase 2: Sample rollups table for data aggregation

-- Create rollup table for pre-aggregated sample metrics
CREATE TABLE sample_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  bucket_start TIMESTAMPTZ NOT NULL,
  bucket_end TIMESTAMPTZ NOT NULL,
  sample_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  missed_count INT NOT NULL DEFAULT 0,
  system_error_count INT NOT NULL DEFAULT 0,
  avg_rtt_ms NUMERIC,
  max_rtt_ms NUMERIC,
  min_rtt_ms NUMERIC,
  p95_rtt_ms NUMERIC,
  avg_jitter_ms NUMERIC,
  max_jitter_ms NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(job_id, bucket_start)
);

-- Index for efficient rollup lookups
CREATE INDEX idx_rollups_job_bucket ON sample_rollups(job_id, bucket_start);

-- Enable RLS
ALTER TABLE sample_rollups ENABLE ROW LEVEL SECURITY;

-- Users can view all rollups (internal app)
CREATE POLICY "Users can view all rollups"
  ON sample_rollups FOR SELECT
  USING (true);

-- System can manage rollups (for edge functions and backend)
CREATE POLICY "System can manage rollups"
  ON sample_rollups FOR ALL
  USING (true);

-- Function to create rollups for a completed job
CREATE OR REPLACE FUNCTION create_job_rollups(p_job_id UUID, p_bucket_minutes INT DEFAULT 5)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO sample_rollups (
    job_id, bucket_start, bucket_end,
    sample_count, success_count, missed_count, system_error_count,
    avg_rtt_ms, max_rtt_ms, min_rtt_ms, avg_jitter_ms, max_jitter_ms
  )
  SELECT
    p_job_id,
    date_trunc('hour', recorded_at) + 
      (EXTRACT(minute FROM recorded_at)::int / p_bucket_minutes) * 
      (p_bucket_minutes || ' minutes')::interval AS bucket_start,
    date_trunc('hour', recorded_at) + 
      ((EXTRACT(minute FROM recorded_at)::int / p_bucket_minutes) + 1) * 
      (p_bucket_minutes || ' minutes')::interval AS bucket_end,
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'missed'),
    COUNT(*) FILTER (WHERE status = 'system_error'),
    AVG(rtt_ms) FILTER (WHERE status = 'success'),
    MAX(rtt_ms) FILTER (WHERE status = 'success'),
    MIN(rtt_ms) FILTER (WHERE status = 'success'),
    AVG(jitter_ms) FILTER (WHERE jitter_ms IS NOT NULL),
    MAX(jitter_ms) FILTER (WHERE jitter_ms IS NOT NULL)
  FROM samples
  WHERE job_id = p_job_id
  GROUP BY bucket_start, bucket_end
  ON CONFLICT (job_id, bucket_start) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Enable realtime for sample_rollups
ALTER PUBLICATION supabase_realtime ADD TABLE sample_rollups;