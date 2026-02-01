

# Add Poller Health Monitoring and Fallback for Real Polling Jobs

## Problem Summary

Job `61d89f43` was created with `real_polling` mode but received 0 samples because the OpenShift poller service was not running or not connected at that time. The frontend correctly skipped the browser simulator, but there was no way to detect or recover from the missing poller.

## Root Cause

The OpenShift poller service (`services/poller/`) must be running and connected to both:
1. **Supabase** - to fetch running jobs and insert samples
2. **SpreeDB Latency API** - to execute actual ICMP pings

When the poller is down or misconfigured, `real_polling` jobs silently receive no data.

---

## Proposed Solution

Add visibility and optional fallback for when the external poller is not functioning.

### 1. Add "Poller Stale" Detection on Job Detail Page

When viewing a `real_polling` job that has been running for more than 2x the cadence interval with no samples, show a warning alert.

**File: `src/pages/JobDetail.tsx`**

```typescript
// Detect if real_polling job appears stuck
const isPollerStale = useMemo(() => {
  if (!job || job.status !== 'running') return false;
  if (job.monitoring_mode !== 'real_polling') return false;
  if (samples.length > 0) return false;
  
  const staleDuration = job.cadence_seconds * 2 * 1000; // 2x cadence
  const timeSinceStart = Date.now() - new Date(job.started_at).getTime();
  return timeSinceStart > staleDuration;
}, [job, samples]);
```

**Add warning UI:**

```typescript
{isPollerStale && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>No Samples Detected</AlertTitle>
    <AlertDescription>
      This job uses real polling mode but no samples have been received.
      The external poller service may not be running or may have lost connectivity.
      Check OpenShift pod status and logs.
    </AlertDescription>
  </Alert>
)}
```

### 2. Add `last_ping_at` Display in Job Configuration

Show when the poller last touched this job (currently hidden). This helps diagnose connectivity issues.

**File: `src/pages/JobDetail.tsx`**

Add to the Job Configuration card:

```typescript
<div>
  <dt className="font-medium text-muted-foreground">Last Ping</dt>
  <dd>{job.last_ping_at ? formatDateTime(job.last_ping_at) : 'Never'}</dd>
</div>
```

### 3. Optional: Add Browser Fallback Button

Add a button that allows manually starting the browser simulator for testing when the poller is unavailable.

**File: `src/lib/ping-simulator.ts`**

Add a force-start function:

```typescript
export function forceStartSimulator(
  jobId: string,
  cadenceSeconds: number,
  durationMinutes: number,
  startedAt: string
) {
  // Force start regardless of monitoring mode
  if (activeSimulators.has(jobId)) {
    return false;
  }
  
  // Calculate remaining duration
  const startTime = new Date(startedAt).getTime();
  const elapsedMinutes = (Date.now() - startTime) / 60000;
  const remainingMinutes = Math.max(0, durationMinutes - elapsedMinutes);
  
  if (remainingMinutes <= 0) {
    return false;
  }
  
  const scenario = pickRandomScenario();
  // ... existing simulator logic with remaining duration
  return true;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/JobDetail.tsx` | Add stale poller detection and warning UI |
| `src/pages/JobDetail.tsx` | Add `last_ping_at` to Job Configuration display |
| `src/lib/ping-simulator.ts` | Add `forceStartSimulator` function (optional) |

---

## Immediate Workarounds

For testing right now without code changes:

1. **Use test account `123456789`** - This forces `simulated` mode and uses the browser simulator
2. **Check OpenShift pod status** - Verify the poller pods are running: `oc get pods -l app=soundcheck-poller`
3. **Check poller logs** - Look for connection errors: `oc logs -l app=soundcheck-poller --tail=100`
4. **Verify environment variables** - Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set correctly in the deployment

---

## Technical Details

| Aspect | Details |
|--------|---------|
| Files Modified | 2 (`JobDetail.tsx`, `ping-simulator.ts`) |
| New Dependencies | None |
| Risk Level | Low - additive changes only |
| Breaking Changes | None |

