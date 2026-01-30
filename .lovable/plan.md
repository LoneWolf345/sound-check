

# Vite Preview Proxy Implementation for CORS Bypass

## Current State

The Sound Check frontend currently:
- Uses **nginx** as the runtime in production (via multi-stage Docker build)
- Calls the poller-service API directly from the browser using `VITE_POLLER_SERVICE_URL`
- This causes **CORS issues** when the poller-service doesn't include the proper headers
- Has two API endpoints that need proxying:
  - `/api/accounts/:accountNumber` - Account validation
  - `/api/devices/:ipAddress` - Device info lookup

## Solution: Switch to Vite Preview Mode with Server-Side Proxy

Replace nginx with Vite's preview server in production. The proxy middleware intercepts `/api/poller/*` requests and forwards them server-side to the internal poller-service, eliminating CORS entirely.

### Request Flow

```text
+----------------+      +-------------------+      +-------------------+
|   Browser      |      |   Vite Preview    |      |  Poller Service   |
|   (Frontend)   |      |   (Port 8080)     |      |  (Internal K8s)   |
+-------+--------+      +--------+----------+      +--------+----------+
        |                        |                          |
        |  GET /api/poller/...   |                          |
        |----------------------->|                          |
        |  (same-origin, no CORS)|                          |
        |                        |  fetch(POLLER_API_URL)   |
        |                        |------------------------->|
        |                        |  (server-to-server)      |
        |                        |<-------------------------|
        |                        |  JSON response           |
        |  JSON + CORS headers   |                          |
        |<-----------------------|                          |
        |                        |                          |
```

## Implementation Plan

### 1. Update Frontend API Clients

**Files:** `src/lib/account-validation.ts`, `src/lib/device-validation.ts`

Create a helper to determine the effective base URL:
- In **production** (`import.meta.env.PROD`): Use `/api/poller` (proxied)
- In **development**: Use `VITE_POLLER_SERVICE_URL` directly (for local testing with real service) or mock fallback

```typescript
function getPollerBaseUrl(): string {
  if (import.meta.env.PROD) {
    return '/api/poller';  // Proxied through Vite preview
  }
  return import.meta.env.VITE_POLLER_SERVICE_URL || '';
}
```

Update fetch calls:
- `account-validation.ts`: Change `${POLLER_SERVICE_URL}/api/accounts/...` → `${getPollerBaseUrl()}/accounts/...`
- `device-validation.ts`: Change `${POLLER_SERVICE_URL}/api/devices/...` → `${getPollerBaseUrl()}/devices/...`

### 2. Add Vite Preview Middleware

**File:** `vite.config.ts`

Add a custom middleware plugin that runs in preview mode to handle `/api/poller/*` requests:

```typescript
import { defineConfig, type Plugin, type PreviewServerHook } from "vite";

function pollerProxyPlugin(): Plugin {
  return {
    name: 'poller-proxy',
    configurePreviewServer(server) {
      // Read runtime env var (not VITE_ prefixed - runtime, not build-time)
      const POLLER_API_URL = process.env.POLLER_API_URL;
      
      if (!POLLER_API_URL) {
        console.warn('[Proxy] POLLER_API_URL not set, /api/poller/* will return 503');
      }
      
      server.middlewares.use('/api/poller', async (req, res, next) => {
        if (!POLLER_API_URL) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            error: { code: 'PROXY_NOT_CONFIGURED', message: 'Backend proxy not configured' }
          }));
          return;
        }
        
        // Forward to internal poller service
        const targetUrl = `${POLLER_API_URL}/api${req.url}`;
        
        try {
          const response = await fetch(targetUrl, {
            method: req.method || 'GET',
            headers: { 'Accept': 'application/json' },
          });
          
          const data = await response.text();
          
          res.statusCode = response.status;
          res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(data);
        } catch (error) {
          console.error('[Proxy] Error forwarding request:', error);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            error: { code: 'PROXY_ERROR', message: 'Failed to reach backend service' }
          }));
        }
      });
    }
  };
}
```

### 3. Update Dockerfile to Use Vite Preview

**File:** `Dockerfile`

Replace the nginx runtime stage with Node.js running Vite preview:

```dockerfile
# Build stage (unchanged)
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

RUN npm run build

# Runtime stage - Vite Preview instead of nginx
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy built assets and required files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/vite.config.ts ./
COPY --from=builder /app/tsconfig*.json ./

# Install only production deps needed for vite preview
RUN npm ci --omit=dev && npm install vite

# Runtime env var for proxy (not VITE_ - it's server-side)
ENV POLLER_API_URL=""

# OpenShift non-root user
RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "8080"]
```

### 4. Update package.json Scripts

**File:** `package.json`

Add a production preview script:

```json
{
  "scripts": {
    "preview": "vite preview",
    "preview:prod": "vite preview --host 0.0.0.0 --port 8080"
  }
}
```

### 5. Update Environment Documentation

**File:** `.env.example`

Add the runtime environment variable:

```bash
# ===========================================
# Sound Check - Environment Variables
# ===========================================

# --- Build-Time Variables (VITE_*) ---
# Embedded into the JavaScript bundle at build time.

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
VITE_SUPABASE_PROJECT_ID=your-project-id

# --- Runtime Variables (Server-Side Proxy) ---
# Used by Vite preview server at runtime, NOT embedded in JS.

# Poller Service URL - internal Kubernetes service URL
# Used by the server-side proxy to forward API requests
POLLER_API_URL=http://soundcheck-poller.soundcheck.svc.cluster.local:3001
```

### 6. Update README Documentation

**File:** `README.md`

Update the deployment section:

- Explain the switch from nginx to Vite preview
- Document the new runtime env var `POLLER_API_URL`
- Update the Mermaid diagram to show the proxy flow
- Add OpenShift deployment notes for passing runtime env vars

### 7. Remove nginx.conf

**File:** `nginx.conf`

This file can be removed since we're no longer using nginx for production.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/account-validation.ts` | Use `/api/poller/accounts/...` in production |
| `src/lib/device-validation.ts` | Use `/api/poller/devices/...` in production |
| `vite.config.ts` | Add `pollerProxyPlugin()` for preview server middleware |
| `Dockerfile` | Replace nginx with Vite preview runtime |
| `package.json` | Add `preview:prod` script |
| `.env.example` | Document `POLLER_API_URL` runtime variable |
| `README.md` | Update deployment documentation |
| `nginx.conf` | Delete (no longer needed) |

## Key Differences from nginx Approach

| Aspect | nginx (Before) | Vite Preview (After) |
|--------|----------------|----------------------|
| Runtime | Static file server | Node.js + Vite |
| Proxy | Would need nginx proxy_pass config | Built into Vite config |
| CORS | Would need nginx headers | Handled by middleware |
| SPA Routing | try_files directive | Built into Vite preview |
| Config | Separate nginx.conf | All in vite.config.ts |
| Image Size | ~25MB | ~150MB (includes Node.js) |

## OpenShift Deployment Notes

In OpenShift, pass the runtime environment variable:

```yaml
# In deployment or configmap
env:
  - name: POLLER_API_URL
    value: "http://soundcheck-poller.soundcheck.svc.cluster.local:3001"
```

Or via ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: soundcheck-config
data:
  POLLER_API_URL: "http://soundcheck-poller.soundcheck.svc.cluster.local:3001"
```

## Testing Locally

```bash
# Build
npm run build

# Run with proxy (simulating production)
POLLER_API_URL=http://localhost:3001 npm run preview

# Or without proxy (will use mock fallback)
npm run preview
```

