
# Enable Browser-Based Real Polling via Latency API

## Problem Summary

The `real_polling` jobs are not receiving samples because:
1. The browser simulator correctly skips `real_polling` jobs (as designed)
2. No process is calling the Latency API to execute actual ICMP pings
3. The SpreeDB Latency API is running and available via the Vite proxy

## Solution

Add browser-based real polling that calls `/api/latency/ping` directly from the frontend via the existing Vite proxy.

## Architecture

```text
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Browser   │────▶│  Vite      │────▶│  SpreeDB   │
│  (real-    │     │  Proxy     │     │  Latency   │
│  ping-     │     │  /api/     │     │  API       │
│  executor) │     │  latency   │     │            │
└─────┬──────┘     └────────────┘     └────────────┘
      │
      │ Insert samples
      ▼
┌────────────┐
│  Supabase  │
│  samples   │
└────────────┘
```

## Implementation

### 1. Create Real Ping Executor (New File)

**File: `src/lib/real-ping-executor.ts`**

- Call `/api/latency/ping` via fetch with target IP
- Calculate jitter from consecutive RTT values
- Insert samples into Supabase with real ICMP data
- Update `last_ping_at` on job for health monitoring
- Handle timeouts and errors gracefully

### 2. Update CreateJob Page

**File: `src/pages/CreateJob.tsx`**

- Import `startRealPolling` from real-ping-executor
- After job creation, check `monitoring_mode`
- If `real_polling`: call `startRealPolling(jobId, targetIp, cadence, duration, startedAt)`
- If `simulated`: call existing `startSimulator()`

### 3. Update JobDetail Page

**File: `src/pages/JobDetail.tsx`**

- Import `startRealPolling` and `isRealPollingActive`
- When viewing a running `real_polling` job, resume polling if not already active
- This handles page refreshes and returning to in-progress jobs

### 4. Update Ping Simulator Integration

**File: `src/lib/ping-simulator.ts`**

- Import real-ping-executor functions
- Update `checkAndCompleteExpiredJobs` to resume real polling jobs
- Coordinate between simulated and real execution paths

## Files Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/real-ping-executor.ts` | **New** | Browser-based ICMP ping executor |
| `src/pages/CreateJob.tsx` | Modify | Start real polling for real_polling jobs |
| `src/pages/JobDetail.tsx` | Modify | Resume real polling when viewing job |
| `src/lib/ping-simulator.ts` | Modify | Integrate with real-ping-executor |

## Technical Notes

- **Browser Tab Required**: Polling runs while browser tab is open
- **Tab Backgrounding**: Browser may throttle intervals in background tabs
- **Auto-Resume**: Polling restarts when user revisits JobDetail page
- **Graceful Degradation**: Falls back to error status if Latency API unavailable
