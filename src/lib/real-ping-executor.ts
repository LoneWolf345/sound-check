// Real Ping Executor
// Browser-based ICMP ping execution via Latency API proxy

import { supabase } from '@/integrations/supabase/client';
import { getServiceBaseUrl, isServiceConfigured } from '@/lib/api-services';
import type { SampleStatus } from '@/types';

// Store active real polling jobs by job ID
const activeRealPollers = new Map<string, NodeJS.Timeout>();
// Store previous RTT for jitter calculation per job
const previousRttByJob = new Map<string, number | null>();

interface PingResult {
  success: boolean;
  rtt_ms: number | null;
  error?: string;
}

// Execute a single ping via the Latency API
async function executePing(targetIp: string): Promise<PingResult> {
  const baseUrl = getServiceBaseUrl('latency');
  
  if (!baseUrl && !import.meta.env.PROD) {
    // In development without API configured, return simulated failure
    console.warn('Latency API not configured, ping will fail');
    return { success: false, rtt_ms: null, error: 'Latency API not configured' };
  }

  try {
    const response = await fetch(`${baseUrl}/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ip: targetIp }),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Ping API error: ${response.status} - ${errorText}`);
      return { success: false, rtt_ms: null, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    
    // Handle SpreeDB Latency API response format
    // Expected: { success: true, rtt_ms: number } or { success: false }
    if (data.success && typeof data.rtt_ms === 'number') {
      return { success: true, rtt_ms: data.rtt_ms };
    } else if (data.rtt !== undefined) {
      // Alternative format: { rtt: number } in milliseconds
      return { success: true, rtt_ms: data.rtt };
    } else if (data.latency !== undefined) {
      // Alternative format: { latency: number }
      return { success: true, rtt_ms: data.latency };
    } else {
      // No response (timeout/unreachable)
      return { success: false, rtt_ms: null };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, rtt_ms: null, error: 'Ping timeout' };
    }
    console.error('Ping execution error:', error);
    return { success: false, rtt_ms: null, error: 'Network error' };
  }
}

// Insert a real sample into the database
async function insertRealSample(
  jobId: string,
  sequenceNumber: number,
  pingResult: PingResult
): Promise<boolean> {
  // Determine sample status
  let status: SampleStatus;
  if (pingResult.success) {
    status = 'success';
  } else if (pingResult.error?.includes('API') || pingResult.error?.includes('Network')) {
    status = 'system_error';
  } else {
    status = 'missed';
  }

  // Calculate jitter as absolute difference from previous RTT
  let jitter_ms: number | null = null;
  const previousRtt = previousRttByJob.get(jobId);

  if (status === 'success' && pingResult.rtt_ms !== null) {
    if (previousRtt !== null) {
      jitter_ms = Math.abs(pingResult.rtt_ms - previousRtt);
      jitter_ms = Math.round(jitter_ms * 100) / 100;
    }
    previousRttByJob.set(jobId, pingResult.rtt_ms);
  }

  const { error } = await supabase.from('samples').insert({
    job_id: jobId,
    sequence_number: sequenceNumber,
    status,
    rtt_ms: pingResult.rtt_ms,
    jitter_ms,
  });

  if (error) {
    console.error('Failed to insert real sample:', error);
    return false;
  }

  // Update last_ping_at on the job for health monitoring
  await supabase
    .from('jobs')
    .update({ last_ping_at: new Date().toISOString() })
    .eq('id', jobId);

  return true;
}

// Complete a job and trigger completion email
async function completeRealPollingJob(jobId: string) {
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    console.error('Failed to complete job:', error);
    return;
  }

  console.log(`Real polling job ${jobId} completed`);

  // Trigger completion email
  try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const jobDetailUrl = `${window.location.origin}/jobs/${jobId}`;

    let session = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        session = data.session;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!session?.access_token) {
      console.warn('No authenticated session - completion email will not be sent');
      return;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-completion-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ jobId, jobDetailUrl }),
    });

    const result = await response.json();
    if (result.success) {
      console.log(`Completion email sent to ${result.recipient}`);
    } else {
      console.error('Failed to send completion email:', result.error);
    }
  } catch (emailError) {
    console.error('Error triggering completion email:', emailError);
  }
}

// Start real polling for a job
export async function startRealPolling(
  jobId: string,
  targetIp: string,
  cadenceSeconds: number,
  durationMinutes: number,
  startedAt: string
): Promise<boolean> {
  // Don't start if already running
  if (activeRealPollers.has(jobId)) {
    console.log(`Real poller already running for job ${jobId}`);
    return false;
  }

  // Check if latency service is available
  if (!import.meta.env.PROD && !isServiceConfigured('latency')) {
    console.warn(`Latency API not configured for job ${jobId} - real polling will record failures`);
  }

  // Calculate timing
  const startTime = new Date(startedAt).getTime();
  const endTime = startTime + durationMinutes * 60 * 1000;

  // Check if already expired
  if (Date.now() >= endTime) {
    console.log(`Job ${jobId} already expired, completing instead of starting`);
    await completeRealPollingJob(jobId);
    return false;
  }

  // Get the last sequence number to continue from
  const { data: existingSamples } = await supabase
    .from('samples')
    .select('sequence_number')
    .eq('job_id', jobId)
    .order('sequence_number', { ascending: false })
    .limit(1);

  let sequenceNumber = (existingSamples?.[0]?.sequence_number ?? -1) + 1;

  console.log(
    `Starting real polling for job ${jobId} targeting ${targetIp}, cadence: ${cadenceSeconds}s, starting at sequence ${sequenceNumber}`
  );

  // Execute first ping immediately
  const firstPing = await executePing(targetIp);
  await insertRealSample(jobId, sequenceNumber++, firstPing);

  // Set up interval for subsequent pings
  const intervalId = setInterval(async () => {
    const now = Date.now();

    // Check if job should complete
    if (now >= endTime) {
      stopRealPolling(jobId);
      await completeRealPollingJob(jobId);
      return;
    }

    // Execute ping and record result
    const pingResult = await executePing(targetIp);
    await insertRealSample(jobId, sequenceNumber++, pingResult);
  }, cadenceSeconds * 1000);

  activeRealPollers.set(jobId, intervalId);
  return true;
}

// Stop real polling for a job
export function stopRealPolling(jobId: string) {
  const intervalId = activeRealPollers.get(jobId);
  if (intervalId) {
    clearInterval(intervalId);
    activeRealPollers.delete(jobId);
    previousRttByJob.delete(jobId);
    console.log(`Stopped real polling for job ${jobId}`);
  }
}

// Check if real polling is active for a job
export function isRealPollingActive(jobId: string): boolean {
  return activeRealPollers.has(jobId);
}

// Stop all active real pollers
export function stopAllRealPollers() {
  for (const [jobId, intervalId] of activeRealPollers) {
    clearInterval(intervalId);
    console.log(`Stopped real poller for job ${jobId}`);
  }
  activeRealPollers.clear();
  previousRttByJob.clear();
}

// Get count of active real pollers
export function getActiveRealPollerCount(): number {
  return activeRealPollers.size;
}
