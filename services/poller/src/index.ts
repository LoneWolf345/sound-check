/**
 * Sound Check Poller Service
 * 
 * Backend service that handles ICMP ping execution for all running monitoring jobs.
 * Designed to run as multiple replicas in OpenShift with job partitioning.
 * 
 * Features:
 * - Polls for running jobs and executes pings via SpreeDB Latency API
 * - Batches sample inserts for efficiency
 * - Horizontally scalable via job hash partitioning
 * - Health check endpoint for Kubernetes probes
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import PQueue from 'p-queue';

// Configuration from environment
const PORT = parseInt(process.env.PORT || '3000', 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const BATCH_FLUSH_INTERVAL_MS = parseInt(process.env.BATCH_FLUSH_INTERVAL_MS || '2000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '50', 10);
const REPLICA_COUNT = parseInt(process.env.REPLICA_COUNT || '1', 10);
const REPLICA_ID = parseInt(process.env.REPLICA_ID || '0', 10);
const LATENCY_API_URL = process.env.LATENCY_API_URL || 'http://localhost:4402';

// Supabase client - use pooler URL for high concurrency
const SUPABASE_URL = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Types
interface Job {
  id: string;
  target_ip: string | null;
  target_mac: string | null;
  cadence_seconds: number;
  duration_minutes: number;
  started_at: string;
  last_ping_at: string | null;
  status: string;
  monitoring_mode: string;
}

interface Sample {
  job_id: string;
  sequence_number: number;
  status: 'success' | 'missed' | 'system_error';
  rtt_ms: number | null;
  jitter_ms: number | null;
}

interface PingResult {
  success: boolean;
  rtt_ms?: number;
  error?: string;
}

// State
const pingQueue = new PQueue({ concurrency: CONCURRENCY });
const sampleBatch: Sample[] = [];
const jobSequenceNumbers = new Map<string, number>();
const previousRttByJob = new Map<string, number>();
let isShuttingDown = false;

// Simple hash function for job partitioning
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Check if this replica should handle a specific job
function shouldHandleJob(jobId: string): boolean {
  if (REPLICA_COUNT <= 1) return true;
  return hashCode(jobId) % REPLICA_COUNT === REPLICA_ID;
}

// Execute a ping via SpreeDB Latency API
async function executePing(ip: string): Promise<PingResult> {
  try {
    const response = await fetch(`${LATENCY_API_URL}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip }),
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json() as { success: boolean; rtt_ms?: number; error?: string };
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// Process a single job ping
async function executeAndRecordPing(job: Job): Promise<void> {
  if (!job.target_ip) {
    console.warn(`Job ${job.id} has no target IP, skipping`);
    return;
  }

  const result = await executePing(job.target_ip);
  
  // Get or initialize sequence number for this job
  let sequenceNumber = jobSequenceNumbers.get(job.id) ?? 0;
  sequenceNumber++;
  jobSequenceNumbers.set(job.id, sequenceNumber);

  // Calculate jitter if we have a previous RTT
  let jitter_ms: number | null = null;
  if (result.success && result.rtt_ms !== undefined) {
    const previousRtt = previousRttByJob.get(job.id);
    if (previousRtt !== undefined) {
      jitter_ms = Math.abs(result.rtt_ms - previousRtt);
    }
    previousRttByJob.set(job.id, result.rtt_ms);
  }

  // Create sample record
  const sample: Sample = {
    job_id: job.id,
    sequence_number: sequenceNumber,
    status: result.success ? 'success' : (result.error?.includes('timeout') ? 'missed' : 'system_error'),
    rtt_ms: result.rtt_ms ?? null,
    jitter_ms,
  };

  sampleBatch.push(sample);

  // Update last_ping_at on the job
  await supabase
    .from('jobs')
    .update({ last_ping_at: new Date().toISOString() })
    .eq('id', job.id);
}

// Check if a job should be pinged now based on cadence
function shouldPingNow(job: Job): boolean {
  const now = Date.now();
  const lastPing = job.last_ping_at ? new Date(job.last_ping_at).getTime() : 0;
  const nextPing = lastPing + (job.cadence_seconds * 1000);
  return now >= nextPing;
}

// Check if a job has exceeded its duration
function isJobExpired(job: Job): boolean {
  const startTime = new Date(job.started_at).getTime();
  const endTime = startTime + (job.duration_minutes * 60 * 1000);
  return Date.now() > endTime;
}

// Complete an expired job
async function completeJob(jobId: string): Promise<void> {
  console.log(`Completing expired job ${jobId}`);
  
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

  // Create rollups for the completed job
  const { error: rollupError } = await supabase.rpc('create_job_rollups', { p_job_id: jobId });
  if (rollupError) {
    console.error(`Failed to create rollups for job ${jobId}:`, rollupError);
  }

  // Clean up state
  jobSequenceNumbers.delete(jobId);
  previousRttByJob.delete(jobId);

  // TODO: Trigger completion email via edge function
}

// Main poll loop
async function pollLoop(): Promise<void> {
  if (isShuttingDown) return;

  try {
    // Fetch all running jobs with real_polling mode
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'running')
      .eq('monitoring_mode', 'real_polling');

    if (error) {
      console.error('Failed to fetch jobs:', error);
      return;
    }

    if (!jobs?.length) return;

    console.log(`Found ${jobs.length} running jobs, processing ${jobs.filter(j => shouldHandleJob(j.id)).length} for this replica`);

    for (const job of jobs as Job[]) {
      // Skip jobs not assigned to this replica
      if (!shouldHandleJob(job.id)) continue;

      // Check if job should complete
      if (isJobExpired(job)) {
        await completeJob(job.id);
        continue;
      }

      // Check if it's time to ping
      if (shouldPingNow(job)) {
        pingQueue.add(() => executeAndRecordPing(job));
      }
    }
  } catch (error) {
    console.error('Error in poll loop:', error);
  }
}

// Flush sample batch to database
async function flushBatch(): Promise<void> {
  if (sampleBatch.length === 0) return;

  const toInsert = sampleBatch.splice(0, BATCH_SIZE);
  console.log(`Flushing ${toInsert.length} samples to database`);

  const { error } = await supabase
    .from('samples')
    .insert(toInsert);

  if (error) {
    console.error('Batch insert failed:', error);
    // Put samples back for retry (at the beginning)
    sampleBatch.unshift(...toInsert);
  }
}

// Express app for health checks
const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    replica: `${REPLICA_ID + 1}/${REPLICA_COUNT}`,
    queueSize: pingQueue.size,
    pendingSamples: sampleBatch.length,
    activeJobs: jobSequenceNumbers.size,
  });
});

app.get('/ready', (req, res) => {
  if (isShuttingDown) {
    res.status(503).json({ status: 'shutting_down' });
  } else {
    res.json({ status: 'ready' });
  }
});

// Graceful shutdown
function shutdown(): void {
  console.log('Shutting down gracefully...');
  isShuttingDown = true;

  // Flush remaining samples
  if (sampleBatch.length > 0) {
    console.log(`Flushing ${sampleBatch.length} remaining samples...`);
    flushBatch().then(() => {
      console.log('Shutdown complete');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the service
console.log(`Starting Sound Check Poller Service`);
console.log(`  Replica: ${REPLICA_ID + 1}/${REPLICA_COUNT}`);
console.log(`  Poll interval: ${POLL_INTERVAL_MS}ms`);
console.log(`  Batch flush interval: ${BATCH_FLUSH_INTERVAL_MS}ms`);
console.log(`  Concurrency: ${CONCURRENCY}`);
console.log(`  Latency API: ${LATENCY_API_URL}`);

// Start poll loop
setInterval(pollLoop, POLL_INTERVAL_MS);

// Start batch flush loop
setInterval(flushBatch, BATCH_FLUSH_INTERVAL_MS);

// Start HTTP server
app.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

// Initial poll
pollLoop();
