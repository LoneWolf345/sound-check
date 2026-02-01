
# Update Jobs List: Show IP, Avg RTT, and Packet Loss

## Overview

Update the jobs list table to display:
1. **Target IP** instead of Target MAC
2. **Avg RTT** (average round-trip time in milliseconds)
3. **Packet Loss** (percentage of missed samples)

## Current State

The `jobs` table does not store summary metrics - they're calculated on-demand from samples. Loading samples for every job in the list would be slow and defeat the pagination optimization.

## Solution: Add Summary Columns to Jobs Table

Add summary columns to the `jobs` table that get populated when:
- Jobs complete (via the completion process)
- Running jobs are updated periodically by the poller service

---

## Database Changes

### Migration: Add summary columns to jobs table

```sql
-- Add summary metrics columns to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS avg_rtt_ms NUMERIC;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS packet_loss_percent NUMERIC;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_samples INTEGER DEFAULT 0;

-- Index for sorting by metrics
CREATE INDEX IF NOT EXISTS idx_jobs_packet_loss ON jobs(packet_loss_percent) 
  WHERE packet_loss_percent IS NOT NULL;
```

---

## Frontend Changes

### 1. Update Types (`src/types/index.ts`)

Add new fields to the Job interface:

```typescript
export interface Job {
  // ... existing fields
  avg_rtt_ms: number | null;
  packet_loss_percent: number | null;
  total_samples: number;
}
```

### 2. Update JobList Table (`src/pages/JobList.tsx`)

**Change column headers:**
| Current | New |
|---------|-----|
| Target (MAC/IP) | Target IP |
| - | Avg RTT |
| - | Packet Loss |
| Source | (remove to make space) |

**Update table structure:**

```typescript
<TableHeader>
  <TableRow>
    <TableHead>Account</TableHead>
    <TableHead>Target IP</TableHead>
    <TableHead>Duration</TableHead>
    <TableHead>Status</TableHead>
    <TableHead className="text-right">Avg RTT</TableHead>
    <TableHead className="text-right">Packet Loss</TableHead>
    <TableHead>Started</TableHead>
    <TableHead className="text-right">Actions</TableHead>
  </TableRow>
</TableHeader>
```

**Update row rendering:**

```typescript
<TableRow key={job.id}>
  <TableCell className="font-medium">{job.account_number}</TableCell>
  <TableCell className="font-mono text-sm">
    {job.target_ip || '—'}
  </TableCell>
  <TableCell>{formatDurationFromMinutes(job.duration_minutes)}</TableCell>
  <TableCell>
    <Badge variant={getStatusBadgeVariant(job.status)}>
      {job.status}
    </Badge>
  </TableCell>
  <TableCell className="text-right font-mono text-sm">
    {job.avg_rtt_ms !== null ? `${job.avg_rtt_ms.toFixed(1)} ms` : '—'}
  </TableCell>
  <TableCell className="text-right font-mono text-sm">
    {job.packet_loss_percent !== null 
      ? <span className={job.packet_loss_percent > 2 ? 'text-destructive' : ''}>
          {job.packet_loss_percent.toFixed(1)}%
        </span>
      : '—'}
  </TableCell>
  <TableCell className="text-muted-foreground text-sm">
    {formatDateTime(job.started_at)}
  </TableCell>
  <TableCell className="text-right">
    {/* Actions buttons */}
  </TableCell>
</TableRow>
```

### 3. Update Poller Service (`services/poller/src/index.ts`)

Update the poller to periodically refresh job summary metrics:

```typescript
async function updateJobSummary(jobId: string) {
  // Calculate summary from recent samples
  const { data: samples } = await supabase
    .from('samples')
    .select('status, rtt_ms')
    .eq('job_id', jobId);
  
  if (!samples?.length) return;
  
  const successSamples = samples.filter(s => s.status === 'success');
  const missedSamples = samples.filter(s => s.status === 'missed');
  const validAttempts = successSamples.length + missedSamples.length;
  
  const avgRtt = successSamples.length > 0
    ? successSamples.reduce((sum, s) => sum + (s.rtt_ms || 0), 0) / successSamples.length
    : null;
  
  const packetLoss = validAttempts > 0
    ? (missedSamples.length / validAttempts) * 100
    : null;
  
  await supabase
    .from('jobs')
    .update({
      avg_rtt_ms: avgRtt,
      packet_loss_percent: packetLoss,
      total_samples: samples.length,
    })
    .eq('id', jobId);
}
```

### 4. Update Job Completion Logic

Ensure summary is calculated and stored when job completes in the existing completion flow.

---

## Files to Modify

| File | Changes |
|------|---------|
| New migration | Add `avg_rtt_ms`, `packet_loss_percent`, `total_samples` columns |
| `src/types/index.ts` | Add new fields to Job interface |
| `src/pages/JobList.tsx` | Update table columns and rendering |
| `services/poller/src/index.ts` | Add summary update function |
| `src/hooks/use-jobs.ts` | Update useCompleteJob to calculate/store summary |

---

## Visual Changes

**Before:**
| Account | Target | Duration | Status | Started | Source | Actions |

**After:**
| Account | Target IP | Duration | Status | Avg RTT | Packet Loss | Started | Actions |

- Packet loss values > 2% will be highlighted in red
- Missing values (for running jobs with no samples yet) show "—"
