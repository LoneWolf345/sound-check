
# Plan: Fix Completion Emails for Real Polling Jobs

## Problem Summary

Completion emails are **not being sent** for any jobs (both `simulated` and `real_polling` modes). Investigation revealed:

1. **No email records exist** - The `alerts` table has 0 `completion_email` entries for all completed jobs
2. **Edge function never invoked** - No logs exist for `send-completion-email` function
3. **Multiple issues in the auto-completion flow** cause emails to be skipped

## Root Cause Analysis

### Issue 1: Session May Not Exist When Auto-Completing

In `completeJob()` (ping-simulator.ts lines 162-167):
```typescript
const { data: { session } } = await supabase.auth.getSession();

if (!session?.access_token) {
  console.warn('No authenticated session - completion email will not be sent');
  return;  // ← Silent exit, no email sent
}
```

When a job auto-completes via `checkAndCompleteExpiredJobs()` on page load, the auth session might not be fully initialized yet, causing this check to fail silently.

### Issue 2: Simulator Resume Logic Ignores Monitoring Mode

In `checkAndCompleteExpiredJobs()` (line 258):
```typescript
resumeSimulatorForJob(job, lastSequence + 1);
```

This attempts to resume the simulator for ALL running jobs, including `real_polling` jobs. For `real_polling` jobs, this creates **duplicate simulated samples** alongside the real samples from the external poller (which explains the initial "5 missed pings" - they might be from this).

### Issue 3: No Retry or Fallback for Email Delivery

If the email API call fails for any reason, there's no retry mechanism or queue - the email is simply lost.

---

## Solution Overview

Fix the auto-completion flow to properly handle `real_polling` jobs and ensure emails are sent reliably.

---

## Implementation Steps

### Step 1: Add Monitoring Mode Check to Resume Logic

Prevent simulator resume attempts for `real_polling` jobs in both `checkAndCompleteExpiredJobs()` and `checkAndHandleJob()`:

```typescript
// In checkAndCompleteExpiredJobs():
} else if (!isSimulatorRunning(job.id) && job.monitoring_mode !== 'real_polling') {
  // Only resume simulator for simulated jobs
  resumeSimulatorForJob(job, lastSequence + 1);
  resumed.push(job.id);
}
```

### Step 2: Ensure Session Exists Before Sending Email

Add session wait/retry logic or use a more reliable approach:

```typescript
async function completeJob(jobId: string) {
  // Update job status first
  const { error } = await supabase
    .from('jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) {
    console.error('Failed to complete job:', error);
    return;
  }

  // Wait briefly for session to be available if needed
  let session = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      session = data.session;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!session?.access_token) {
    console.warn('No authenticated session after retries - completion email will not be sent');
    return;
  }

  // Proceed with email...
}
```

### Step 3: Add Console Logging for Email Attempts

Add more detailed logging to trace email delivery issues:

```typescript
console.log(`Attempting to send completion email for job ${jobId}...`);
const response = await fetch(...);
console.log(`Email API response status: ${response.status}`);
```

### Step 4: Update Job Type to Include monitoring_mode

Ensure the `resumeSimulatorForJob` function signature and callers pass `monitoring_mode`:

```typescript
export function resumeSimulatorForJob(
  job: { 
    id: string; 
    started_at: string; 
    duration_minutes: number; 
    cadence_seconds: number;
    monitoring_mode?: string;  // Add this
  },
  startSequence: number
) {
  // Skip for real_polling jobs
  if (job.monitoring_mode === 'real_polling') {
    console.log(`Skipping simulator resume for real_polling job ${job.id}`);
    return;
  }
  // ... rest of function
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/ping-simulator.ts` | Add monitoring_mode checks to prevent duplicate samples; add session retry logic; improve logging |

---

## Expected Outcome

After implementation:
- Completion emails will be sent reliably when jobs complete
- `real_polling` jobs will not have simulator resume attempts (no duplicate/simulated samples)
- Better logging will help debug any future email issues

---

## Testing Verification

1. Start a short-duration (1-2 minute) `real_polling` job
2. Wait for it to complete naturally
3. Verify the completion email is received
4. Check console logs for email delivery confirmation
5. Verify no duplicate samples are created
