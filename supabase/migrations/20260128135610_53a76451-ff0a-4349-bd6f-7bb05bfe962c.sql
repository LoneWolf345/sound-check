-- Fix: Tighten jobs INSERT policy to prevent requester_id spoofing
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can create jobs" ON public.jobs;

-- Create new constrained policy requiring requester_id to match authenticated user
CREATE POLICY "Users can create their own jobs"
ON public.jobs FOR INSERT
WITH CHECK (requester_id = auth.uid());