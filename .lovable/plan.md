
# Scalability Plan: 5,000 Concurrent Jobs

## Status: ✅ Phases 1-6 Implemented

This plan addresses the architectural changes required to scale from ~100 job capacity to 5,000 concurrent jobs on OpenShift.

---

## ✅ Implementation Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Database Indexes | ✅ Done | Added 6 critical indexes |
| Phase 1.2: Query Limits | ✅ Done | Pagination in hooks, 500 sample cap |
| Phase 2: Sample Rollups | ✅ Done | Rollup table + aggregation function |
| Phase 3: Backend Poller | ✅ Done | Node.js service with OpenShift manifests |
| Phase 4: Simulator Update | ✅ Done | Uses test account detection |
| Phase 6: Chart Performance | ✅ Done | Downsampling to 500 points max |

---

## Impact Analysis at 5,000 Jobs


| Metric | Current (100 jobs) | At Scale (5,000 jobs) |
|--------|-------------------|----------------------|
| Sample inserts/sec | ~10 | ~500 |
| Samples/day | ~864K | ~43.2M |
| Storage/day | ~86MB | ~4.3GB |
| Storage/month | ~2.6GB | ~130GB |
| Browser timers | 100 | 5,000 (crashes) |
| DB connections | ~5 | ~50+ (limit exceeded) |

---

## Phase 1: Database Optimization (Immediate)

### 1.1 Add Critical Indexes

Create indexes for the most common query patterns to prevent full table scans.

**SQL Migration:**
```sql
-- Index for job status filtering (dashboard, job list)
CREATE INDEX idx_jobs_status ON jobs(status);

-- Index for user's jobs lookup
CREATE INDEX idx_jobs_requester_created ON jobs(requester_id, created_at DESC);

-- Index for running job queries
CREATE INDEX idx_jobs_status_started ON jobs(status, started_at) 
  WHERE status = 'running';

-- Index for sample time-range queries
CREATE INDEX idx_samples_job_recorded ON samples(job_id, recorded_at DESC);

-- Index for sample sequence lookups
CREATE INDEX idx_samples_job_sequence ON samples(job_id, sequence_number DESC);

-- Partial index for recent alerts
CREATE INDEX idx_alerts_triggered ON alerts(triggered_at DESC)
  WHERE triggered_at > NOW() - INTERVAL '7 days';
```

### 1.2 Add Query Limits to Hooks

Update `use-jobs.ts` to enforce pagination and prevent loading all data.

**File: `src/hooks/use-jobs.ts`**

```typescript
// Add pagination to useJobs
export function useJobs(options?: { 
  status?: JobStatus | 'all'; 
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = options?.page ?? 1;
  const pageSize = Math.min(options?.pageSize ?? 50, 100); // Cap at 100
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: ['jobs', options?.status, options?.search, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      // ... filters
    },
  });
}

// Add windowed sample loading for charts
export function useJobSamplesWindowed(
  jobId: string | undefined,
  options?: { limit?: number; offset?: number }
) {
  const limit = options?.limit ?? 500;
  
  return useQuery({
    queryKey: ['samples', jobId, limit, options?.offset],
    queryFn: async () => {
      if (!jobId) return { samples: [], total: 0 };
      
      const { data, count, error } = await supabase
        .from('samples')
        .select('*', { count: 'exact' })
        .eq('job_id', jobId)
        .order('sequence_number', { ascending: false })
        .limit(limit);
        
      if (error) throw error;
      return { 
        samples: (data as Sample[]).reverse(), 
        total: count ?? 0 
      };
    },
    enabled: !!jobId,
  });
}
```

---

## Phase 2: Sample Data Aggregation

### 2.1 Create Rollup Table

Store pre-aggregated metrics per time bucket (5-minute windows) to avoid loading raw samples for completed jobs.

**SQL Migration:**
```sql
CREATE TABLE sample_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  bucket_start TIMESTAMPTZ NOT NULL,
  bucket_end TIMESTAMPTZ NOT NULL,
  sample_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  missed_count INT NOT NULL DEFAULT 0,
  system_error_count INT NOT NULL DEFAULT 0,
  avg_rtt_ms NUMERIC,
  max_rtt_ms NUMERIC,
  min_rtt_ms NUMERIC,
  p95_rtt_ms NUMERIC,
  avg_jitter_ms NUMERIC,
  max_jitter_ms NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(job_id, bucket_start)
);

CREATE INDEX idx_rollups_job_bucket ON sample_rollups(job_id, bucket_start);

-- Enable RLS
ALTER TABLE sample_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all rollups"
  ON sample_rollups FOR SELECT
  USING (true);

CREATE POLICY "System can manage rollups"
  ON sample_rollups FOR ALL
  USING (true);
```

### 2.2 Create Rollup Function

Database function to aggregate samples into rollups on job completion.

**SQL Migration:**
```sql
CREATE OR REPLACE FUNCTION create_job_rollups(p_job_id UUID, p_bucket_minutes INT DEFAULT 5)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO sample_rollups (
    job_id, bucket_start, bucket_end,
    sample_count, success_count, missed_count, system_error_count,
    avg_rtt_ms, max_rtt_ms, min_rtt_ms, avg_jitter_ms, max_jitter_ms
  )
  SELECT
    p_job_id,
    date_trunc('hour', recorded_at) + 
      (EXTRACT(minute FROM recorded_at)::int / p_bucket_minutes) * 
      (p_bucket_minutes || ' minutes')::interval AS bucket_start,
    date_trunc('hour', recorded_at) + 
      ((EXTRACT(minute FROM recorded_at)::int / p_bucket_minutes) + 1) * 
      (p_bucket_minutes || ' minutes')::interval AS bucket_end,
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'missed'),
    COUNT(*) FILTER (WHERE status = 'system_error'),
    AVG(rtt_ms) FILTER (WHERE status = 'success'),
    MAX(rtt_ms) FILTER (WHERE status = 'success'),
    MIN(rtt_ms) FILTER (WHERE status = 'success'),
    AVG(jitter_ms) FILTER (WHERE jitter_ms IS NOT NULL),
    MAX(jitter_ms) FILTER (WHERE jitter_ms IS NOT NULL)
  FROM samples
  WHERE job_id = p_job_id
  GROUP BY bucket_start, bucket_end
  ON CONFLICT (job_id, bucket_start) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

### 2.3 Update Job Detail Page

Use rollups for completed jobs, raw samples only for running jobs.

**File: `src/pages/JobDetail.tsx`**

```typescript
// For running jobs: load recent samples (last 500)
// For completed jobs: load rollups for charts, summary from job record

const { data: rollups } = useQuery({
  queryKey: ['rollups', id],
  queryFn: async () => {
    if (!id) return [];
    const { data, error } = await supabase
      .from('sample_rollups')
      .select('*')
      .eq('job_id', id)
      .order('bucket_start', { ascending: true });
    if (error) throw error;
    return data;
  },
  enabled: !!id && job?.status === 'completed',
});
```

---

## Phase 3: Backend Poller Service

### 3.1 Architecture Overview

Move sample generation from browser to a dedicated OpenShift service that handles all polling centrally.

```text
+------------------+     +-------------------+     +------------------+
|   Frontend       |     |  Poller Service   |     |   Supabase       |
|   (React)        |     |  (Node.js)        |     |   (Database)     |
+------------------+     +-------------------+     +------------------+
        |                        |                        |
        | 1. Create Job          |                        |
        |----------------------->|                        |
        |                        | 2. Insert job          |
        |                        |----------------------->|
        |                        |                        |
        |                        | 3. Poll running jobs   |
        |                        |<-----------------------|
        |                        |                        |
        |                        | 4. Execute pings       |
        |                        |    (SpreeDB API)       |
        |                        |                        |
        |                        | 5. Batch insert samples|
        |                        |----------------------->|
        |                        |                        |
        | 6. Realtime updates    |                        |
        |<-----------------------|------------------------|
```

### 3.2 Poller Service Design

**New Directory: `services/poller/`**

```typescript
// services/poller/src/index.ts
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import PQueue from 'p-queue';

const POLL_INTERVAL = 5000; // Check for jobs every 5s
const BATCH_SIZE = 100; // Insert samples in batches
const CONCURRENCY = 50; // Max concurrent ping operations

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const pingQueue = new PQueue({ concurrency: CONCURRENCY });
const sampleBatch: Sample[] = [];

async function pollLoop() {
  // Fetch all running jobs
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'running')
    .eq('monitoring_mode', 'real_polling');

  if (!jobs?.length) return;

  // Check which jobs need a ping based on cadence
  const now = Date.now();
  for (const job of jobs) {
    const lastPing = job.last_ping_at 
      ? new Date(job.last_ping_at).getTime() 
      : 0;
    const nextPing = lastPing + (job.cadence_seconds * 1000);
    
    if (now >= nextPing) {
      pingQueue.add(() => executeAndRecordPing(job));
    }
  }
}

async function flushBatch() {
  if (sampleBatch.length === 0) return;
  
  const toInsert = sampleBatch.splice(0, BATCH_SIZE);
  const { error } = await supabase
    .from('samples')
    .insert(toInsert);
    
  if (error) console.error('Batch insert failed:', error);
}

// Run poll loop every 5 seconds
setInterval(pollLoop, POLL_INTERVAL);
// Flush sample batch every 2 seconds
setInterval(flushBatch, 2000);
```

### 3.3 Horizontal Scaling with Job Partitioning

For 5,000 jobs, deploy multiple poller replicas with job partitioning:

```typescript
// Each replica handles a subset of jobs based on hash
const REPLICA_COUNT = parseInt(process.env.REPLICA_COUNT || '5');
const REPLICA_ID = parseInt(process.env.REPLICA_ID || '0');

async function pollLoop() {
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'running')
    .eq('monitoring_mode', 'real_polling');

  // Filter to jobs for this replica
  const myJobs = jobs?.filter(job => {
    const hash = hashCode(job.id);
    return hash % REPLICA_COUNT === REPLICA_ID;
  });

  // Process only assigned jobs
  for (const job of myJobs || []) {
    // ... ping logic
  }
}
```

### 3.4 OpenShift Deployment

**File: `services/poller/openshift/deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: soundcheck-poller
spec:
  replicas: 5  # 5 replicas for 5,000 jobs (1,000 each)
  selector:
    matchLabels:
      app: soundcheck-poller
  template:
    metadata:
      labels:
        app: soundcheck-poller
    spec:
      containers:
        - name: poller
          image: your-registry/soundcheck-poller:latest
          env:
            - name: SUPABASE_URL
              valueFrom:
                secretKeyRef:
                  name: soundcheck-secrets
                  key: supabase-url
            - name: SUPABASE_SERVICE_ROLE_KEY
              valueFrom:
                secretKeyRef:
                  name: soundcheck-secrets
                  key: service-role-key
            - name: LATENCY_API_URL
              value: "http://spreedb-latency.internal:4402"
            - name: REPLICA_COUNT
              value: "5"
            - name: REPLICA_ID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

---

## Phase 4: Remove Browser-Based Simulator

### 4.1 Update Frontend Code

Remove the browser simulator entirely; all jobs use the backend poller.

**File: `src/lib/ping-simulator.ts`**

```typescript
// Keep only for development/demo mode
export function startSimulator(...) {
  if (import.meta.env.PROD) {
    console.log('Production mode: using backend poller');
    return;
  }
  // ... keep existing simulator code for dev only
}
```

### 4.2 Update Job Creation

Set `monitoring_mode` to `'real_polling'` by default.

**File: `src/pages/CreateJob.tsx`**

```typescript
// Always use real_polling in production
const monitoringMode = import.meta.env.PROD 
  ? 'real_polling' 
  : 'simulated';

const jobData = {
  // ...
  monitoring_mode: monitoringMode,
};
```

---

## Phase 5: Connection Pooling and Optimization

### 5.1 Use Supabase Connection Pooler

Update the poller service to use transaction pooling mode.

```typescript
// Use pooler URL for high-concurrency workloads
const supabase = createClient(
  process.env.SUPABASE_POOLER_URL!, // e.g., xxx.pooler.supabase.com
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'X-Connection-Pool': 'transaction',
      },
    },
  }
);
```

### 5.2 Batch Database Operations

Update the completion email edge function to use batch queries.

**File: `supabase/functions/send-completion-email/index.ts`**

```typescript
// Fetch job and summary in a single query
const { data } = await supabase.rpc('get_job_with_summary', { 
  p_job_id: jobId 
});

// Or use rollups instead of recalculating from samples
const { data: rollups } = await supabase
  .from('sample_rollups')
  .select('*')
  .eq('job_id', jobId);

const summary = aggregateRollups(rollups);
```

---

## Phase 6: Frontend Performance

### 6.1 Virtualized Job List

Use virtual scrolling for large job lists.

**File: `src/pages/JobList.tsx`**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function JobList() {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: jobs?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // row height
    overscan: 10,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <JobRow key={jobs[virtualRow.index].id} job={jobs[virtualRow.index]} />
        ))}
      </div>
    </div>
  );
}
```

### 6.2 Chart Downsampling

Limit chart data points to prevent rendering slowdowns.

**File: `src/components/charts/RTTChart.tsx`**

```typescript
function downsample(samples: Sample[], maxPoints: number = 500): Sample[] {
  if (samples.length <= maxPoints) return samples;
  
  const step = Math.ceil(samples.length / maxPoints);
  return samples.filter((_, i) => i % step === 0);
}

export function RTTChart({ samples }: RTTChartProps) {
  const displaySamples = useMemo(
    () => downsample(samples, 500),
    [samples]
  );
  // ... render with displaySamples
}
```

---

## Implementation Order

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Phase 1: Database Indexes | High | 2 hours | Immediate query speed |
| Phase 2: Query Limits | High | 4 hours | Prevents UI crashes |
| Phase 3: Backend Poller | Critical | 2-3 days | Enables scale |
| Phase 4: Remove Browser Sim | High | 2 hours | Cleanup |
| Phase 5: Connection Pooling | Medium | 4 hours | Stability at scale |
| Phase 6: Frontend Performance | Medium | 1 day | UX at scale |
| Phase 2.1-2.3: Rollups | Medium | 1 day | Storage efficiency |

---

## Technical Summary

### New Dependencies

**Frontend:**
- `@tanstack/react-virtual` - Virtual scrolling for job list

**Poller Service:**
- `express` - HTTP server for health checks
- `p-queue` - Concurrency control
- `@supabase/supabase-js` - Database client

### New Files

| File | Purpose |
|------|---------|
| `services/poller/src/index.ts` | Main poller service |
| `services/poller/Dockerfile` | Container build |
| `services/poller/openshift/deployment.yaml` | K8s manifest |
| Migration: `add_indexes.sql` | Database indexes |
| Migration: `create_rollups.sql` | Rollup table + function |

### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/use-jobs.ts` | Add pagination, windowed queries |
| `src/pages/JobList.tsx` | Virtual scrolling, pagination UI |
| `src/pages/JobDetail.tsx` | Use rollups for completed jobs |
| `src/components/charts/RTTChart.tsx` | Add downsampling |
| `src/lib/ping-simulator.ts` | Disable in production |
| `supabase/functions/send-completion-email/index.ts` | Use rollups |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Max concurrent jobs | ~100 | 5,000 |
| Job list load time | 2-5s | <500ms |
| Job detail load time | 1-3s | <1s |
| Sample storage growth | Unbounded | 80% reduction via rollups |
| Browser memory usage | Grows with jobs | Constant |
