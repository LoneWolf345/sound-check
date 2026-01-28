
# Phase 2: Job Management - Implementation Plan

## Overview
Phase 2 focuses on wiring the existing UI to the database and implementing the mock ping simulator. This phase will make job creation, listing, viewing, and cancellation fully functional with real data persistence.

---

## Part 1: Database Hooks & Queries

### 1.1 Create React Query Hooks
Create a new hooks file `src/hooks/use-jobs.ts` with the following hooks:

- **useJobs**: Fetch all jobs with filtering and search
- **useJob**: Fetch a single job by ID
- **useJobSamples**: Fetch samples for a specific job
- **useCreateJob**: Mutation to create a new job
- **useCancelJob**: Mutation to cancel a running job
- **useJobStats**: Fetch dashboard statistics

### 1.2 Create Admin Config Hook
Create `src/hooks/use-admin-config.ts`:

- **useAdminConfig**: Fetch all admin configuration values
- **useUpdateAdminConfig**: Mutation to update config (admin only)

### 1.3 Create Audit Log Hook
Create `src/hooks/use-audit-log.ts`:

- **useAuditLogs**: Fetch audit log entries with pagination
- **useCreateAuditLog**: Utility to create audit entries

---

## Part 2: Wire Up Job Creation

### 2.1 Update CreateJob.tsx
- Connect form submission to `useCreateJob` mutation
- Insert job record into `jobs` table
- Create audit log entry for `job.create` action
- Check usage limits before allowing creation:
  - Count user's jobs today (max 50)
  - Count global running jobs (max 100)
- Show clear error messages if limits exceeded

### 2.2 Load Admin Presets Dynamically
- Fetch duration/cadence presets from `admin_config` table
- Replace hardcoded `DURATION_PRESETS` and `CADENCE_PRESETS`
- Fall back to defaults if config not loaded

---

## Part 3: Wire Up Job List

### 3.1 Update JobList.tsx
- Replace `MOCK_JOBS` with `useJobs` hook
- Implement real filtering by status
- Implement real search across account number, MAC, IP, job ID
- Add loading states and error handling
- Wire up cancel button to `useCancelJob` mutation

---

## Part 4: Wire Up Job Detail

### 4.1 Update JobDetail.tsx
- Fetch job data using `useJob(id)` hook
- Fetch samples using `useJobSamples(id)` hook
- Calculate summary metrics from real sample data
- Show loading skeleton while fetching
- Handle "job not found" case gracefully
- Wire up cancel button to `useCancelJob` mutation

---

## Part 5: Mock Ping Simulator

### 5.1 Create Ping Simulator Service
Create `src/lib/ping-simulator.ts`:

- Function to generate and insert mock samples for a job
- Uses the existing `generateMockSamples` logic
- Configurable scenario (healthy, intermittent, offline)
- Runs on a timer to simulate real-time sample collection

### 5.2 Simulate Job Execution
When a job is created:
1. Job starts immediately (status = 'running')
2. Simulator begins generating samples at the configured cadence
3. Samples are inserted into the `samples` table
4. When duration expires, job status updates to 'completed'

### 5.3 Real-time Updates
- Enable Supabase Realtime on `jobs` and `samples` tables
- Job Detail page subscribes to sample updates
- Dashboard/Job List subscribes to job status changes

---

## Part 6: Wire Up Dashboard

### 6.1 Update Dashboard.tsx
- Fetch real stats using `useJobStats` hook:
  - Count of running jobs
  - Count of jobs completed today
  - Average packet loss across today's jobs
  - Count of alerts triggered today
- Fetch recent jobs (last 5) for current user
- Display real data in stat cards and recent jobs list

---

## Part 7: Cancel Job Flow

### 7.1 Implement Job Cancellation
- Update job status to 'cancelled'
- Set `cancelled_at` timestamp
- Stop the ping simulator (if running in browser)
- Create audit log entry for `job.cancel`
- Show confirmation dialog before cancelling

---

## Part 8: Admin Settings Persistence

### 8.1 Wire Up AdminSettings.tsx
- Load current config values from `admin_config` table
- Save changes using `useUpdateAdminConfig` mutation
- Create audit log entries with before/after values
- Show success/error toast on save

---

## Technical Details

### Database Queries Summary

**Jobs:**
```sql
-- Fetch all jobs (with optional filters)
SELECT * FROM jobs 
WHERE status = ? AND (account_number ILIKE ? OR target_mac ILIKE ? OR target_ip ILIKE ?)
ORDER BY created_at DESC
LIMIT 100

-- Create job
INSERT INTO jobs (account_number, target_mac, target_ip, ...) VALUES (...)

-- Cancel job
UPDATE jobs SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?
```

**Samples:**
```sql
-- Fetch samples for job
SELECT * FROM samples WHERE job_id = ? ORDER BY sequence_number ASC
```

**Stats:**
```sql
-- Running jobs count
SELECT COUNT(*) FROM jobs WHERE status = 'running'

-- Completed today
SELECT COUNT(*) FROM jobs 
WHERE status = 'completed' AND completed_at >= CURRENT_DATE

-- User jobs today
SELECT COUNT(*) FROM jobs 
WHERE requester_id = ? AND created_at >= CURRENT_DATE
```

### Real-time Subscriptions

```typescript
// Enable realtime for tables (migration)
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE samples;

// Subscribe to job updates
supabase.channel('jobs').on('postgres_changes', { 
  event: '*', schema: 'public', table: 'jobs' 
}, callback)

// Subscribe to new samples for a specific job
supabase.channel(`samples:${jobId}`).on('postgres_changes', {
  event: 'INSERT', schema: 'public', table: 'samples',
  filter: `job_id=eq.${jobId}`
}, callback)
```

### Files to Create
- `src/hooks/use-jobs.ts` - Job-related React Query hooks
- `src/hooks/use-admin-config.ts` - Admin config hooks
- `src/hooks/use-audit-log.ts` - Audit logging hooks
- `src/lib/ping-simulator.ts` - Mock ping simulation service

### Files to Update
- `src/pages/CreateJob.tsx` - Wire to database
- `src/pages/JobList.tsx` - Wire to database
- `src/pages/JobDetail.tsx` - Wire to database
- `src/pages/Dashboard.tsx` - Wire to database
- `src/pages/AdminSettings.tsx` - Wire to database

### Migration Required
Add realtime publication for jobs and samples tables:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE samples;
```

---

## Summary
This phase transforms the application from static mock data to a fully functional data-driven app with:
- Real job persistence in the database
- Mock ping data generation simulating real poller behavior
- Real-time updates as samples are collected
- Usage limit enforcement
- Audit logging for all actions
