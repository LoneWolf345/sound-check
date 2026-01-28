
# Fix Stuck Jobs - Auto-Complete Expired Jobs

## Problem Summary
The ping simulator runs entirely in the browser. When the browser tab is closed or the user navigates away, the `setInterval` stops and jobs never complete. This job should have finished 13+ hours ago.

## Solution Overview
Add logic to automatically detect and complete expired jobs, plus resume simulators for jobs that haven't expired yet.

---

## Implementation Steps

### 1. Add Expired Job Detection Utility
Create a new function in `src/lib/ping-simulator.ts`:

| Function | Purpose |
|----------|---------|
| `checkAndCompleteExpiredJobs()` | Query for running jobs past their expected end time and mark them complete |
| `resumeSimulatorIfNeeded()` | For running jobs not yet expired, resume the simulator from where it left off |

### 2. Update Job Detail Page
Modify `src/pages/JobDetail.tsx` to:
- Check if a running job has expired and complete it automatically
- Resume the simulator for running jobs that still have time remaining
- Show appropriate messaging when a job is auto-completed

### 3. Update Dashboard
Modify `src/pages/Dashboard.tsx` to:
- Run expired job check on load to clean up stuck jobs system-wide

### 4. Trigger Email on Auto-Complete
Ensure the completion email is sent when jobs are auto-completed (may need to handle the case where no authenticated session exists for background completion).

---

## Technical Details

### Expired Job Check Logic
```text
For each running job:
  expected_end_time = started_at + duration_minutes
  
  IF now > expected_end_time:
    Mark job as completed
    Trigger completion email
  ELSE IF simulator not running:
    Resume simulator for remaining time
```

### New Functions in ping-simulator.ts

1. **`checkAndCompleteExpiredJob(job)`** - Complete a single expired job
2. **`resumeSimulatorForJob(job, existingSampleCount)`** - Resume simulator from last sample

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/ping-simulator.ts` | Add `checkAndCompleteExpiredJob()`, `resumeSimulatorForJob()` |
| `src/pages/JobDetail.tsx` | Auto-complete/resume on page load for running jobs |
| `src/pages/Dashboard.tsx` | Run expired check on mount |
| `src/hooks/use-jobs.ts` | Add `useCompleteExpiredJobs()` hook (optional) |

---

## Edge Cases Handled

1. **Job expired while away** - Auto-completed with existing samples
2. **Job still has time left** - Simulator resumes from last sequence number
3. **No auth session** - Completion email logs warning but job still completes
4. **Multiple stuck jobs** - All expired jobs cleaned up on Dashboard load

## Notes
- This is a client-side fix for the simulator architecture
- For production reliability, a backend cron job would be the ideal long-term solution
- The existing samples are preserved - only status and completed_at are updated
