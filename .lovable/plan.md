

# Vite Preview Proxy Implementation

## Status: ✅ Implemented

The Sound Check frontend now uses Vite Preview mode with a server-side proxy middleware to bypass CORS restrictions.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/poller-api.ts` | **NEW** - Centralized helper for API base URL routing |
| `src/lib/account-validation.ts` | Uses `getPollerBaseUrl()` for production proxy |
| `src/lib/device-validation.ts` | Uses `getPollerBaseUrl()` for production proxy |
| `vite.config.ts` | Added `pollerProxyPlugin()` middleware |
| `Dockerfile` | Switched from nginx to Vite preview runtime |
| `.env.example` | Documented build-time and runtime variables |
| `README.md` | Updated with proxy architecture and deployment docs |
| `nginx.conf` | **DELETED** - No longer needed |

## How It Works

### Production (Vite Preview)
```
Browser → /api/poller/accounts/123 → Vite Preview → POLLER_API_URL/api/accounts/123
```

### Development
```
Browser → VITE_POLLER_SERVICE_URL/api/accounts/123 (direct, or mock fallback)
```

## Testing Locally

```bash
# Build
npm run build

# Run with proxy
POLLER_API_URL=http://localhost:3001 npm run preview

# Run without proxy (mock fallback)
npm run preview
```

## OpenShift Deployment

Set the runtime environment variable:
```bash
oc set env deployment/soundcheck-app POLLER_API_URL="http://soundcheck-poller.soundcheck.svc.cluster.local:3001"
```
