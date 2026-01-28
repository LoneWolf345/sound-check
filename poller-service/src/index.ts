import { supabase } from './supabase.js';
import { pollLatency } from './poller.js';
import type { Job, Sample } from './types.js';

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

console.log('Sound Check Poller Service starting...');
console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);

/**
 * Check if a job has expired based on its start time and duration
 */
function isJobExpired(startedAt: string, durationMinutes: number): boolean {
  const startTime = new Date(startedAt).getTime();
  const expectedEndTime = startTime + durationMinutes * 60 * 1000;
  return Date.now() > expectedEndTime;
}

/**
 * Check if a ping is due for a job based on cadence and last ping time
 */
function isPingDue(job: Job): boolean {
  if (!job.last_ping_at) {
    return true; // Never pinged, so ping now
  }
  
  const lastPingTime = new Date(job.last_ping_at).getTime();
  const nextPingTime = lastPingTime + job.cadence_seconds * 1000;
  return Date.now() >= nextPingTime;
}

/**
 * Get the next sequence number for a job's samples
 */
async function getNextSequenceNumber(jobId: string): Promise<number> {
  const { data, error } = await supabase
    .from('samples')
    .select('sequence_number')
    .eq('job_id', jobId)
    .order('sequence_number', { ascending: false })
    .limit(1);
  
  if (error) {
    console.error(`Failed to get sequence number for job ${jobId}:`, error);
    return 0;
  }
  
  return data && data.length > 0 ? data[0].sequence_number + 1 : 0;
}

/**
 * Insert a sample into the database
 */
async function insertSample(sample: Sample): Promise<void> {
  const { error } = await supabase.from('samples').insert(sample);
  
  if (error) {
    console.error(`Failed to insert sample for job ${sample.job_id}:`, error);
    throw error;
  }
}

/**
 * Update the last_ping_at timestamp for a job
 */
async function updateLastPingAt(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({ last_ping_at: new Date().toISOString() })
    .eq('id', jobId);
  
  if (error) {
    console.error(`Failed to update last_ping_at for job ${jobId}:`, error);
  }
}

/**
 * Complete a job that has expired
 */
async function completeJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  
  if (error) {
    console.error(`Failed to complete job ${jobId}:`, error);
    return;
  }
  
  console.log(`Job ${jobId} completed`);
  
  // TODO: Trigger completion email via edge function or direct email service
  // For now, the completion email can be triggered separately
}

/**
 * Process a single job: perform ping and record sample
 */
async function processJob(job: Job): Promise<void> {
  // Get the target IP (prefer target_ip over target_mac for polling)
  const targetIp = job.target_ip;
  
  if (!targetIp) {
    console.warn(`Job ${job.id} has no target IP, skipping`);
    return;
  }
  
  // Check if job has expired
  if (isJobExpired(job.started_at, job.duration_minutes)) {
    console.log(`Job ${job.id} has expired, completing...`);
    await completeJob(job.id);
    return;
  }
  
  // Check if a ping is due
  if (!isPingDue(job)) {
    return; // Not time yet
  }
  
  console.log(`Polling job ${job.id} for IP ${targetIp}...`);
  
  // Perform the ping
  const result = await pollLatency(targetIp);
  
  // Get next sequence number
  const sequenceNumber = await getNextSequenceNumber(job.id);
  
  // Insert the sample
  const sample: Sample = {
    job_id: job.id,
    sequence_number: sequenceNumber,
    status: result.status,
    rtt_ms: result.rtt_ms,
  };
  
  await insertSample(sample);
  
  // Update last ping timestamp
  await updateLastPingAt(job.id);
  
  console.log(`Job ${job.id}: ${result.status} - RTT: ${result.rtt_ms ?? 'N/A'}ms`);
}

/**
 * Main loop: fetch running jobs and process them
 */
async function runPollCycle(): Promise<void> {
  try {
    // Fetch all running jobs with real_polling mode
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'running')
      .eq('monitoring_mode', 'real_polling');
    
    if (error) {
      console.error('Failed to fetch running jobs:', error);
      return;
    }
    
    if (!jobs || jobs.length === 0) {
      return; // No jobs to process
    }
    
    console.log(`Processing ${jobs.length} real_polling job(s)...`);
    
    // Process each job
    for (const job of jobs as Job[]) {
      try {
        await processJob(job);
      } catch (jobError) {
        console.error(`Error processing job ${job.id}:`, jobError);
      }
    }
  } catch (error) {
    console.error('Poll cycle error:', error);
  }
}

/**
 * Graceful shutdown handler
 */
function setupShutdownHandler(): void {
  let isShuttingDown = false;
  
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  setupShutdownHandler();
  
  console.log('Poller service started. Listening for jobs...');
  
  // Run the poll cycle at the configured interval
  setInterval(runPollCycle, POLL_INTERVAL_MS);
  
  // Run immediately on start
  await runPollCycle();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
