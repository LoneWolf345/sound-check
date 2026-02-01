
# Fix Real-Time Chart Updates

## Problem
The latency chart on the Job Detail page is not updating in real-time because of a query key mismatch introduced during the scalability changes.

## Root Cause Analysis
The `useJobSamples` hook was updated to include a `limit` parameter in its query key:
```typescript
// use-jobs.ts line 84
queryKey: ['samples', jobId, limit]
```

But the realtime subscription still invalidates using the old key format:
```typescript
// JobDetail.tsx line 147
queryClient.invalidateQueries({ queryKey: ['samples', id] });
```

React Query requires exact key matches by default, so the cache invalidation silently fails.

---

## Solution

Update the realtime subscription in `JobDetail.tsx` to use partial key matching by setting `exact: false`. This ensures all sample queries for this job (regardless of limit parameter) are invalidated when new samples arrive.

---

## Changes Required

### File: `src/pages/JobDetail.tsx`

**Line 147** - Update samples invalidation to use partial matching:

```typescript
// Before
queryClient.invalidateQueries({ queryKey: ['samples', id] });

// After  
queryClient.invalidateQueries({ queryKey: ['samples', id], exact: false });
```

This single-line change ensures that when a new sample is inserted:
1. The realtime subscription receives the Postgres change notification
2. React Query invalidates ALL queries that start with `['samples', id, ...]`
3. The `useJobSamples` query (with its `limit` parameter) gets refetched
4. The chart updates with the new data

---

## Technical Details

| Aspect | Details |
|--------|---------|
| Files Modified | 1 (`src/pages/JobDetail.tsx`) |
| Lines Changed | 1 |
| Risk Level | Low - isolated change with no side effects |
| Testing | View a running job's detail page and verify the chart updates when new samples arrive |

---

## Verification Steps

1. Navigate to a running job's detail page
2. Observe that the RTT chart and metrics update in real-time as new samples are collected
3. Confirm the sample count in the progress bar increments automatically
