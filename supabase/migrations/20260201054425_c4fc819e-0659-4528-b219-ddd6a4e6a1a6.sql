-- Add jitter_ms column to samples table
-- Jitter is calculated as the absolute difference in RTT from the previous sample (IPDV)
ALTER TABLE public.samples
ADD COLUMN jitter_ms numeric NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.samples.jitter_ms IS 'Inter-packet delay variation (jitter) in milliseconds, calculated as absolute difference from previous sample RTT';