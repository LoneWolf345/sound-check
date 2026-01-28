import { supabase } from '@/integrations/supabase/client';
import type { SampleStatus } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export type SimulatorScenario = 'healthy' | 'intermittent' | 'offline';

// Store active simulators by job ID
const activeSimulators = new Map<string, NodeJS.Timeout>();

// Generate a single sample based on scenario
function generateSample(
  scenario: SimulatorScenario,
  sampleIndex: number
): { status: SampleStatus; rtt_ms: number | null } {
  const rand = Math.random();

  switch (scenario) {
    case 'healthy':
      // 98% success, 1% missed, 1% system error
      if (rand < 0.98) {
        return { status: 'success', rtt_ms: 15 + Math.random() * 30 }; // 15-45ms
      } else if (rand < 0.99) {
        return { status: 'missed', rtt_ms: null };
      } else {
        return { status: 'system_error', rtt_ms: null };
      }

    case 'intermittent':
      // Simulate bursts of issues
      const inBadPeriod = (sampleIndex % 20) < 5; // 25% of time in bad period
      if (inBadPeriod) {
        // During bad period: 50% success, 40% missed, 10% system error
        if (rand < 0.5) {
          return { status: 'success', rtt_ms: 50 + Math.random() * 150 }; // 50-200ms (higher latency)
        } else if (rand < 0.9) {
          return { status: 'missed', rtt_ms: null };
        } else {
          return { status: 'system_error', rtt_ms: null };
        }
      } else {
        // During good period: 95% success
        if (rand < 0.95) {
          return { status: 'success', rtt_ms: 20 + Math.random() * 40 }; // 20-60ms
        } else {
          return { status: 'missed', rtt_ms: null };
        }
      }

    case 'offline':
      // First few samples might work, then mostly offline
      if (sampleIndex < 3) {
        return { status: 'success', rtt_ms: 25 + Math.random() * 35 };
      } else if (rand < 0.05) {
        // Occasional success
        return { status: 'success', rtt_ms: 100 + Math.random() * 200 };
      } else if (rand < 0.95) {
        return { status: 'missed', rtt_ms: null };
      } else {
        return { status: 'system_error', rtt_ms: null };
      }

    default:
      return { status: 'success', rtt_ms: 30 };
  }
}

// Pick a random scenario weighted toward healthy
function pickRandomScenario(): SimulatorScenario {
  const rand = Math.random();
  if (rand < 0.7) return 'healthy';
  if (rand < 0.9) return 'intermittent';
  return 'offline';
}

// Start simulator for a job
export function startSimulator(
  jobId: string,
  cadenceSeconds: number,
  durationMinutes: number,
  scenario?: SimulatorScenario
) {
  // Don't start if already running
  if (activeSimulators.has(jobId)) {
    console.log(`Simulator already running for job ${jobId}`);
    return;
  }

  const selectedScenario = scenario ?? pickRandomScenario();
  let sampleIndex = 0;
  const startTime = Date.now();
  const endTime = startTime + durationMinutes * 60 * 1000;

  console.log(`Starting simulator for job ${jobId} with scenario: ${selectedScenario}`);

  // Insert first sample immediately
  insertSample(jobId, sampleIndex++, selectedScenario);

  // Set up interval for subsequent samples
  const intervalId = setInterval(async () => {
    const now = Date.now();

    // Check if job should complete
    if (now >= endTime) {
      stopSimulator(jobId);
      await completeJob(jobId);
      return;
    }

    // Insert next sample
    await insertSample(jobId, sampleIndex++, selectedScenario);
  }, cadenceSeconds * 1000);

  activeSimulators.set(jobId, intervalId);
}

// Insert a sample into the database
async function insertSample(jobId: string, sequenceNumber: number, scenario: SimulatorScenario) {
  const sample = generateSample(scenario, sequenceNumber);

  const { error } = await supabase.from('samples').insert({
    job_id: jobId,
    sequence_number: sequenceNumber,
    status: sample.status,
    rtt_ms: sample.rtt_ms,
  });

  if (error) {
    console.error('Failed to insert sample:', error);
  }
}

// Complete a job and send completion email
async function completeJob(jobId: string) {
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
  
  console.log(`Job ${jobId} completed`);

  // Trigger completion email with authenticated user's token
  try {
    const jobDetailUrl = `${window.location.origin}/jobs/${jobId}`;
    
    // Get current user session for authenticated API call
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      console.warn('No authenticated session - completion email will not be sent');
      return;
    }
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-completion-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
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

// Stop simulator for a job
export function stopSimulator(jobId: string) {
  const intervalId = activeSimulators.get(jobId);
  if (intervalId) {
    clearInterval(intervalId);
    activeSimulators.delete(jobId);
    console.log(`Stopped simulator for job ${jobId}`);
  }
}

// Stop all active simulators
export function stopAllSimulators() {
  for (const [jobId, intervalId] of activeSimulators) {
    clearInterval(intervalId);
    console.log(`Stopped simulator for job ${jobId}`);
  }
  activeSimulators.clear();
}

// Check if a simulator is running for a job
export function isSimulatorRunning(jobId: string): boolean {
  return activeSimulators.has(jobId);
}

// Get count of active simulators
export function getActiveSimulatorCount(): number {
  return activeSimulators.size;
}

// Check if a job has expired based on its start time and duration
export function isJobExpired(startedAt: string, durationMinutes: number): boolean {
  const startTime = new Date(startedAt).getTime();
  const expectedEndTime = startTime + durationMinutes * 60 * 1000;
  return Date.now() > expectedEndTime;
}

// Check and complete all expired running jobs
export async function checkAndCompleteExpiredJobs(): Promise<{ completed: string[]; resumed: string[] }> {
  const completed: string[] = [];
  const resumed: string[] = [];

  // Fetch all running jobs
  const { data: runningJobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'running');

  if (error || !runningJobs) {
    console.error('Failed to fetch running jobs:', error);
    return { completed, resumed };
  }

  for (const job of runningJobs) {
    if (isJobExpired(job.started_at, job.duration_minutes)) {
      // Job should have completed - complete it now
      await completeJob(job.id);
      completed.push(job.id);
      console.log(`Auto-completed expired job ${job.id}`);
    } else if (!isSimulatorRunning(job.id)) {
      // Job still has time but simulator isn't running - resume it
      const { data: existingSamples } = await supabase
        .from('samples')
        .select('sequence_number')
        .eq('job_id', job.id)
        .order('sequence_number', { ascending: false })
        .limit(1);

      const lastSequence = existingSamples?.[0]?.sequence_number ?? -1;
      resumeSimulatorForJob(job, lastSequence + 1);
      resumed.push(job.id);
      console.log(`Resumed simulator for job ${job.id} from sequence ${lastSequence + 1}`);
    }
  }

  return { completed, resumed };
}

// Resume simulator for a specific job that hasn't expired yet
export function resumeSimulatorForJob(
  job: { id: string; started_at: string; duration_minutes: number; cadence_seconds: number },
  startSequence: number
) {
  // Don't start if already running
  if (activeSimulators.has(job.id)) {
    return;
  }

  const scenario = pickRandomScenario();
  let sampleIndex = startSequence;
  const startTime = new Date(job.started_at).getTime();
  const endTime = startTime + job.duration_minutes * 60 * 1000;

  console.log(`Resuming simulator for job ${job.id} with scenario: ${scenario}, starting at sequence ${sampleIndex}`);

  // Calculate remaining time
  const remainingMs = endTime - Date.now();
  if (remainingMs <= 0) {
    // Job should be completed
    completeJob(job.id);
    return;
  }

  // Insert a sample immediately
  insertSample(job.id, sampleIndex++, scenario);

  // Set up interval for subsequent samples
  const intervalId = setInterval(async () => {
    const now = Date.now();

    // Check if job should complete
    if (now >= endTime) {
      stopSimulator(job.id);
      await completeJob(job.id);
      return;
    }

    // Insert next sample
    await insertSample(job.id, sampleIndex++, scenario);
  }, job.cadence_seconds * 1000);

  activeSimulators.set(job.id, intervalId);
}

// Check and handle a single job - complete if expired, resume if still running
export async function checkAndHandleJob(jobId: string): Promise<'completed' | 'resumed' | 'already_running' | 'not_found'> {
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error || !job) {
    console.error('Failed to fetch job:', error);
    return 'not_found';
  }

  if (job.status !== 'running') {
    return 'not_found';
  }

  if (isJobExpired(job.started_at, job.duration_minutes)) {
    await completeJob(job.id);
    return 'completed';
  }

  if (isSimulatorRunning(job.id)) {
    return 'already_running';
  }

  // Resume the simulator
  const { data: existingSamples } = await supabase
    .from('samples')
    .select('sequence_number')
    .eq('job_id', jobId)
    .order('sequence_number', { ascending: false })
    .limit(1);

  const lastSequence = existingSamples?.[0]?.sequence_number ?? -1;
  resumeSimulatorForJob(job, lastSequence + 1);
  return 'resumed';
}
