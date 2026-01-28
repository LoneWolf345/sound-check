# Implement Real Polling via OpenShift Pod

**Status: ✅ IMPLEMENTED**

## Overview
Since the Supabase edge function cannot reach the internal SpreeDB polling API, the actual polling will be performed by a backend service running in an OpenShift pod. The pod will have network access to the internal polling infrastructure.

---

## Architecture

```text
+------------------+     +-------------------+     +------------------+
|   React Web App  |     |  OpenShift Pod    |     |  SpreeDB Poller  |
|   (Browser)      |     |  (poll-service)   |     |  (Internal API)  |
+------------------+     +-------------------+     +------------------+
        |                        |                        |
        |  1. Create Job         |                        |
        +----------------------->|                        |
        |   (via Supabase)       |                        |
        |                        |                        |
        |                  2. Query running jobs          |
        |                  3. For each job:               |
        |                        +----------------------->|
        |                        |  GET /latency/...      |
        |                        |<-----------------------+
        |                        |  { elapsed, error }    |
        |                        |                        |
        |                  4. Insert sample to Supabase   |
        |                        |                        |
        |  5. View results       |                        |
        |<-----------------------+                        |
```

---

## Implementation Plan

### 1. Create Poller Service (TypeScript/Node.js for OpenShift)

Create a standalone Node.js/TypeScript service that:
- Runs as a scheduled worker in the OpenShift pod
- Queries Supabase for active jobs needing pings
- Calls the SpreeDB API for each job
- Inserts samples back to Supabase
- Handles job completion logic

**Location:** `poller-service/` directory at project root

**Key Files:**
| File | Purpose |
|------|---------|
| `poller-service/src/index.ts` | Main entry point / scheduler |
| `poller-service/src/poller.ts` | Core polling logic |
| `poller-service/src/supabase.ts` | Supabase client configuration |
| `poller-service/Dockerfile` | Docker image for OpenShift |
| `poller-service/package.json` | Dependencies |

### 2. Database Schema Update

Add column to track monitoring mode:
```sql
ALTER TABLE jobs ADD COLUMN monitoring_mode TEXT DEFAULT 'simulated';
-- Values: 'simulated', 'real_polling'
```

### 3. Update CreateJob UI

Add a toggle to select monitoring mode:
- **Simulated** (default) - Uses browser-based mock data (current behavior)
- **Real Polling** - Uses the OpenShift poller service

### 4. Modify Ping Simulator Logic

Update `src/lib/ping-simulator.ts` to skip starting the browser-based simulator for jobs with `monitoring_mode = 'real_polling'`.

---

## Poller Service Details

### Core Logic (`poller-service/src/poller.ts`)

```typescript
const POLLER_BASE_URL = 'http://phoenix.polling.corp.cableone.net:4402';

interface PollerResponse {
  elapsed: number;
  error: string;
  expected: string;
  ip: string;
  poller: string;
}

async function pollLatency(targetIp: string): Promise<{
  status: 'success' | 'missed' | 'system_error';
  rtt_ms: number | null;
}> {
  const url = `${POLLER_BASE_URL}/latency/Sound%20Check/${targetIp}/`;
  
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(10000) // 10s timeout
    });
    
    if (!response.ok) {
      return { status: 'system_error', rtt_ms: null };
    }
    
    const data: PollerResponse = await response.json();
    
    if (data.error) {
      // Check if it's a timeout/unreachable error
      if (data.error.includes('timeout') || data.error.includes('unreachable')) {
        return { status: 'missed', rtt_ms: null };
      }
      return { status: 'system_error', rtt_ms: null };
    }
    
    if (data.elapsed > 0) {
      return { status: 'success', rtt_ms: data.elapsed };
    }
    
    return { status: 'missed', rtt_ms: null };
  } catch (error) {
    return { status: 'system_error', rtt_ms: null };
  }
}
```

### Scheduler Logic

The service runs a loop that:
1. Fetches all jobs where `status = 'running'` AND `monitoring_mode = 'real_polling'`
2. For each job, checks if it's time for the next ping based on `cadence_seconds` and `last_ping_at`
3. Performs the ping and inserts the sample
4. Updates `last_ping_at` on the job
5. Checks if job duration has expired and completes it

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `poller-service/package.json` | Node.js dependencies |
| `poller-service/tsconfig.json` | TypeScript config |
| `poller-service/src/index.ts` | Main scheduler entry |
| `poller-service/src/poller.ts` | SpreeDB API client |
| `poller-service/src/supabase.ts` | Supabase client |
| `poller-service/src/types.ts` | Shared types |
| `poller-service/Dockerfile` | Container image |
| `poller-service/.env.example` | Environment vars template |

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add `monitoring_mode` and `last_ping_at` columns |
| `src/types/index.ts` | Add `MonitoringMode` type to Job interface |
| `src/pages/CreateJob.tsx` | Add monitoring mode selector |
| `src/lib/ping-simulator.ts` | Skip simulator for `real_polling` jobs |

---

## Environment Variables for Poller Service

```bash
# Supabase connection
SUPABASE_URL=https://clfajqbhpklfrvrrwvjt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Poller configuration
POLLER_BASE_URL=http://phoenix.polling.corp.cableone.net:4402
POLL_INTERVAL_MS=5000  # How often to check for jobs needing pings
```

---

## Security Considerations

1. **Service Role Key**: The poller service uses the Supabase service role key to bypass RLS (needed to insert samples for any job)
2. **Internal Network**: The poller runs inside the OpenShift cluster with access to the internal polling API
3. **Read-only External**: The React app continues to use the anon key and RLS policies

---

## OpenShift Deployment Notes

The Dockerfile and service are designed to:
- Run as a long-lived process (not serverless)
- Use environment variables for configuration
- Be stateless (all state in Supabase)
- Handle graceful shutdown

---

## Implementation Sequence

1. **Database Migration**: Add `monitoring_mode` and `last_ping_at` columns
2. **Update Types**: Add new fields to TypeScript interfaces
3. **Update CreateJob**: Add monitoring mode selector UI
4. **Update Simulator**: Skip browser simulation for real polling jobs
5. **Create Poller Service**: Standalone Node.js service files
6. **Test Locally**: Verify the poller can connect to Supabase
7. **Build Docker Image**: Create container for OpenShift deployment

