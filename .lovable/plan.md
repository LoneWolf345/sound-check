
# Refactor: Direct Vite Proxy to Internal APIs

## Current Problem

The current architecture has an unnecessary intermediate layer:

```text
Browser --> Vite Proxy --> poller-service (Express) --> Internal APIs
                              ↓
                         Also runs background polling
```

The `poller-service` API layer just proxies requests to the real internal APIs (Billing, SpreeDB). This is redundant when Vite can proxy directly.

## Target Architecture

```text
Browser --> Vite Proxy --> Internal APIs (Billing, SpreeDB)
                              ↓
                  /api/billing/*  --> BILLING_API_URL
                  /api/cm/*       --> CM_INFO_API_URL
```

Background polling (if needed) would be a completely separate concern, not mixed with API proxying.

## Changes Required

### 1. Update vite.config.ts - Multi-Service Proxy

Replace the single `POLLER_API_URL` proxy with multiple service proxies:

| Route | Runtime Env Var | Target |
|-------|-----------------|--------|
| `/api/billing/*` | `BILLING_API_URL` | `https://acp-middleware-account-billing-system-prod...` |
| `/api/cm/*` | `CM_INFO_API_URL` | `http://phoenix.polling.corp.cableone.net:4402` |

The plugin will register middleware for each configured service.

### 2. Update Frontend API Clients

**src/lib/poller-api.ts** - Rename and expand:
- Create `getServiceBaseUrl(serviceName)` helper
- Returns `/api/{service}` in production, `VITE_{SERVICE}_URL` in development

**src/lib/account-validation.ts**:
- Change `getPollerBaseUrl()` to `getServiceBaseUrl('billing')`
- Update fetch URL from `/accounts/{id}` to match Billing API path

**src/lib/device-validation.ts**:
- Change to `getServiceBaseUrl('cm')`
- Update fetch URL to match SpreeDB CM Info API path (`/cm/info/{ip}`)

### 3. Update Environment Configuration

**.env.example** - Document both build-time and runtime variables:

```text
# BUILD-TIME (VITE_*) - for development direct calls
VITE_BILLING_API_URL=https://acp-middleware-account-billing-system-prod...
VITE_CM_INFO_API_URL=http://phoenix.polling.corp.cableone.net:4402

# RUNTIME - for production proxy (set via ConfigMap)
BILLING_API_URL=https://acp-middleware-account-billing-system-prod...
CM_INFO_API_URL=http://phoenix.polling.corp.cableone.net:4402
```

### 4. Update Dockerfile

Change the runtime environment variable from `POLLER_API_URL` to the new multi-service variables:

```dockerfile
ENV BILLING_API_URL="" \
    CM_INFO_API_URL=""
```

### 5. Remove Unnecessary Files

| File/Folder | Action |
|-------------|--------|
| `poller-service/` | Keep ONLY if background polling is still needed; otherwise delete entirely |
| `bun.lock` | Delete (using npm) |
| `bun.lockb` | Delete (using npm) |

### 6. Update README

Update the proxy architecture diagram and OpenShift deployment instructions to reflect:
- Multiple service proxies
- ConfigMap with `BILLING_API_URL` and `CM_INFO_API_URL`

---

## Technical Details

### Vite Proxy Plugin Structure

```typescript
function multiServiceProxyPlugin(): Plugin {
  return {
    name: 'multi-service-proxy',
    configurePreviewServer(server) {
      const services = {
        billing: process.env.BILLING_API_URL,
        cm: process.env.CM_INFO_API_URL,
      };
      
      // Register /api/billing/* proxy
      if (services.billing) {
        server.middlewares.use('/api/billing', createProxyHandler(services.billing));
      }
      
      // Register /api/cm/* proxy
      if (services.cm) {
        server.middlewares.use('/api/cm', createProxyHandler(services.cm));
      }
    }
  };
}
```

### API Path Mapping

| Frontend Call | Proxy Path | Target URL |
|---------------|------------|------------|
| `/api/billing/accounts/8160...` | BILLING_API_URL | `/accounts/8160...` |
| `/api/cm/info/10.1.2.3` | CM_INFO_API_URL | `/cm/info/10.1.2.3` |

### Decision: poller-service folder

Based on the code analysis:
- The background polling loop writes samples to Supabase for `real_polling` jobs
- This functionality is separate from API proxying

**Recommendation**: 
- If you still need background polling for production jobs, keep `poller-service/` but remove its HTTP API server (lines in `api.ts`)
- If all jobs use `simulated` mode (client-side simulator), delete `poller-service/` entirely

## Files to Modify

| File | Change |
|------|--------|
| `vite.config.ts` | Replace single proxy with multi-service proxy |
| `src/lib/poller-api.ts` | Rename/expand to support multiple services |
| `src/lib/account-validation.ts` | Use new service helper for billing |
| `src/lib/device-validation.ts` | Use new service helper for CM info |
| `Dockerfile` | Update ENV vars for multi-service |
| `.env.example` | Document all service URLs |
| `README.md` | Update proxy documentation |
| `bun.lock` | Delete |
| `bun.lockb` | Delete |
