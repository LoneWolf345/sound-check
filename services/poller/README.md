# Sound Check Poller Service

Backend polling service that handles ICMP ping execution for all running monitoring jobs in Sound Check.

## Overview

This service replaces the browser-based simulator for production deployments. It:

- Polls for running jobs with `monitoring_mode: 'real_polling'`
- Executes ICMP pings via the SpreeDB Latency API
- Batches sample inserts for database efficiency
- Horizontally scales via job hash partitioning
- Provides health check endpoints for Kubernetes probes

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenShift Cluster                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Poller #0  │  │  Poller #1  │  │  Poller #N  │             │
│  │ (jobs 0-999)│  │(jobs 1000+) │  │    ...      │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                  ┌───────▼───────┐                              │
│                  │  SpreeDB      │                              │
│                  │  Latency API  │                              │
│                  └───────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                           │
                   ┌───────▼───────┐
                   │   Supabase    │
                   │   (Postgres)  │
                   └───────────────┘
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Health check server port |
| `SUPABASE_URL` | - | Supabase project URL (use pooler URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Supabase service role key |
| `LATENCY_API_URL` | `http://localhost:4402` | SpreeDB Latency API endpoint |
| `POLL_INTERVAL_MS` | `5000` | How often to check for jobs to ping |
| `BATCH_FLUSH_INTERVAL_MS` | `2000` | How often to flush sample batch |
| `BATCH_SIZE` | `100` | Max samples per batch insert |
| `CONCURRENCY` | `50` | Max concurrent ping operations |
| `REPLICA_COUNT` | `1` | Total number of poller replicas |
| `REPLICA_ID` | `0` | This replica's ID (0-indexed) |

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Docker Build

```bash
# Build the image
docker build -t soundcheck-poller:latest .

# Run locally
docker run -p 3000:3000 \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=your-key \
  -e LATENCY_API_URL=http://localhost:4402 \
  soundcheck-poller:latest
```

## Horizontal Scaling

The service supports horizontal scaling through job partitioning:

1. Deploy multiple replicas (e.g., 5 for 5,000 jobs)
2. Set `REPLICA_COUNT` to the total number of replicas
3. Set `REPLICA_ID` to a unique value (0 to REPLICA_COUNT-1) for each replica

Jobs are assigned to replicas based on a hash of the job ID:
```
replica = hash(job_id) % REPLICA_COUNT
```

This ensures:
- Each job is handled by exactly one replica
- Load is evenly distributed
- No coordination needed between replicas

## Health Endpoints

- `GET /health` - Liveness probe, returns service status
- `GET /ready` - Readiness probe, returns `503` during shutdown

## Deployment

See `openshift/deployment.yaml` for Kubernetes/OpenShift deployment configuration.

Key considerations:
- Use Supabase connection pooler URL for high concurrency
- Set appropriate resource limits based on job count
- Configure PodDisruptionBudget for rolling updates
- Use secrets for sensitive configuration
