
# Modem Monitoring Tool - Implementation Plan

## Overview
An internal web application for frontline associates to monitor modem connectivity via ICMP ping jobs. The app provides clear pass/fail outcomes for packet loss and latency, with alerting, email notifications, and TeMPO API integration.

---

## Phase 1: Foundation & Core Infrastructure

### Database Setup (Lovable Cloud)
- **Jobs table**: Store monitoring jobs with status, configuration, and results
- **Samples table**: Store individual ping results (success/missed/system_error)
- **Audit logs table**: Track all user and system actions
- **Admin config table**: Store presets, thresholds, and limits
- **Alerts table**: Track alert states and delivery

### Mock User Context
- Simple user identification (mock SSO bypass)
- Admin vs regular user flag for configuration access

---

## Phase 2: Job Management

### Job Creation Flow
- Account number input with validation (mock Billing API response)
- Target identifier: MAC address or CM management IP
- Duration selector (1, 3, 6, 12 hours / 1, 2 days)
- Cadence selector (10 sec, 1 min, 5 min)
- Reason dropdown (Reactive/Proactive)
- Email notification field (pre-filled with requester)
- Alert opt-in checkboxes (offline alert, recovery alert)
- Inline validation with clear error messages

### Job Execution (Mocked)
- Jobs start immediately on submission
- Mock ping simulator generates realistic data patterns
- Support for configurable scenarios (healthy modem, intermittent issues, offline)
- Automatic job completion at end of duration

### Job Actions
- View running job status in real-time
- Cancel jobs early with confirmation
- View completed job results

---

## Phase 3: Results & Visualization

### Pass/Fail Evaluation
- **Packet Loss**: Calculate missed_pings / total_attempts, compare to threshold (default 2%)
- **Latency**: Calculate p95 RTT, compare to threshold (default 100ms)
- Overall status: PASS only if all metrics pass

### Job Detail View
- Summary tiles showing key metrics:
  - Packet loss % with pass/fail badge
  - p95 latency with pass/fail badge
  - Avg RTT, Max RTT
  - Success rate %
  - Outage event count
  - Longest consecutive miss streak
  - System error count
- Charts (using Recharts):
  - RTT time-series line chart with missed pings marked
  - Availability timeline strip (color-coded)
- Event log showing job lifecycle and alerts

### Job List View
- Table of jobs with filtering:
  - Status filter (Running/Completed/Cancelled/Failed)
  - Search by account number, MAC, IP, job ID
- Sortable columns
- Quick actions (view details, cancel if running)

---

## Phase 4: Alerting System

### Alert State Machine
- Track state per job: OK → OFFLINE_ALERTED → OK
- Trigger offline alert after 5 consecutive missed pings
- Trigger recovery alert after 5 consecutive successes (post-offline)
- No repeated alerts while in same state

### Alert Delivery
- Mock email sending (log to console, show in UI)
- In-app event log entries for each alert

---

## Phase 5: Completion & Notifications

### Completion Email (Mock)
- Generate email content with:
  - Job details (account, target, duration, cadence, reason)
  - Overall PASS/FAIL status
  - Pass/fail table for each metric
  - Embedded chart images (or chart descriptions for mock)
  - Link back to job detail page
- System error note if errors exceed 5%
- Display in UI as "email preview"

---

## Phase 6: Admin Configuration

### Admin Dashboard
- Protected admin-only route
- Duration presets management (add/remove/reorder)
- Cadence presets management
- Threshold configuration:
  - Packet loss % threshold
  - p95 latency threshold
  - System error % threshold for email note
- Usage limits:
  - Jobs per user per day (default: 50)
  - Total running jobs globally (default: 100)
- Default selections for new jobs

### Usage Limit Enforcement
- Block job creation when limits exceeded
- Clear error messages with guidance

---

## Phase 7: TeMPO API Integration

### API Endpoints (Edge Functions)
- `POST /jobs` - Create a new monitoring job
- `GET /jobs/:id` - Fetch job metadata and summary
- `GET /jobs/:id/samples` - Fetch sample data for charts
- `DELETE /jobs/:id` - Cancel a running job

### Webhook System
- Global webhook endpoint configuration (admin setting)
- Event types:
  - `job.started`
  - `job.sample_batch` (batched updates)
  - `job.alert_triggered`
  - `job.completed`
  - `job.cancelled`
- HMAC signature for security
- Webhook delivery logging

---

## Phase 8: Audit & Observability

### Audit Logging
- Automatic logging of all actions:
  - job.create, job.cancel, job.complete
  - alert.triggered
  - admin.config.change (with before/after values)
- Audit log viewer for admins
- Fields: actor, timestamp, action, entity, details

### Dashboard Metrics (Admin View)
- Jobs created today
- Currently running jobs
- Poller/system error rate
- Email/webhook delivery stats

---

## Key Screens

1. **Dashboard/Home**: Quick job creation + recent jobs
2. **Create Job**: Form with all required inputs and validation
3. **Job List**: Searchable, filterable table of jobs
4. **Job Detail**: Full results with charts, metrics, and event log
5. **Admin Settings**: Presets, thresholds, limits configuration
6. **Audit Log**: Searchable log of all system actions

---

## Mock Data Strategy

- Billing API: Returns valid account with mock modem data
- SpreeDB Pollers: Simulated ping results with configurable patterns
- Email: Logged and displayed in UI, not actually sent
- SSO: User identity stored in local state

This approach lets you build and test the complete application flow, then swap in real integrations when ready.
