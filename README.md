# Sound Check

Network monitoring application for tracking latency and availability.

## Project Info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## Technologies

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase (Lovable Cloud)

---

## Development

### Prerequisites

- Node.js & npm - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

### Local Development

```sh
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm i

# Start development server
npm run dev
```

### Testing with Proxy Locally

To test the production proxy behavior locally:

```sh
# Build the app
npm run build

# Run preview with proxy (simulating production)
BILLING_API_URL=https://acp-middleware-account-billing-system-prod.apps.prod-ocp4.corp.cableone.net \
CM_INFO_API_URL=http://phoenix.polling.corp.cableone.net:4402 \
npm run preview

# Or without proxy (uses mock fallback)
npm run preview
```

---

## Docker Deployment (OpenShift)

This application is containerized for deployment on OpenShift using a multi-stage Docker build with Vite preview server for production.

### Architecture

The frontend uses a **multi-service proxy** to bypass CORS restrictions when calling internal APIs:

```mermaid
sequenceDiagram
    participant Browser
    participant Vite as Vite Preview<br/>(Port 8080)
    participant Billing as Billing API<br/>(Internal)
    participant CM as CM Info API<br/>(SpreeDB)

    Browser->>Vite: GET /api/billing/accounts/8160...
    Note over Browser,Vite: Same-origin request<br/>(no CORS)
    
    Vite->>Billing: GET /accounts/8160...
    Note over Vite,Billing: Server-to-server<br/>(CORS doesn't apply)
    
    Billing-->>Vite: JSON response
    Vite-->>Browser: JSON + CORS headers

    Browser->>Vite: GET /api/cm/info/10.1.2.3
    Vite->>CM: GET /cm/info/10.1.2.3
    CM-->>Vite: Device info
    Vite-->>Browser: JSON + CORS headers
```

### Proxy Routes

| Frontend Path | Runtime Env Var | Target |
|---------------|-----------------|--------|
| `/api/billing/*` | `BILLING_API_URL` | Account validation API |
| `/api/cm/*` | `CM_INFO_API_URL` | SpreeDB CM Info API |

### Build & Deploy Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Docker as Docker Build
    participant Registry as Container Registry
    participant OCP as OpenShift

    Dev->>Docker: docker build --build-arg VITE_*
    Docker->>Docker: npm ci && npm run build
    Docker->>Docker: Setup Vite preview runtime
    Docker->>Registry: docker push
    Registry->>OCP: oc new-app / deploy
    Note over OCP: Set BILLING_API_URL,<br/>CM_INFO_API_URL env vars
    OCP->>OCP: Run container on port 8080
    OCP-->>Dev: App available at route
```

### Build the Docker Image

Build-time environment variables must be passed as `--build-arg` since Vite embeds them into the JavaScript bundle:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="https://your-project.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key" \
  --build-arg VITE_SUPABASE_PROJECT_ID="your-project-id" \
  -t soundcheck-app:latest .
```

### Run Locally for Testing

```bash
# Without proxy (uses mock data)
docker run -p 8080:8080 soundcheck-app:latest

# With proxy (connects to internal APIs)
docker run -p 8080:8080 \
  -e BILLING_API_URL="https://acp-middleware-account-billing-system-prod.apps.prod-ocp4.corp.cableone.net" \
  -e CM_INFO_API_URL="http://phoenix.polling.corp.cableone.net:4402" \
  soundcheck-app:latest
```

Then open http://localhost:8080 in your browser.

### Push to Container Registry

```bash
# Tag for your registry
docker tag soundcheck-app:latest your-registry.com/soundcheck-app:latest

# Push
docker push your-registry.com/soundcheck-app:latest
```

### Deploy to OpenShift

```bash
# Create new app from image
oc new-app your-registry.com/soundcheck-app:latest

# Set runtime environment variables for proxy
oc set env deployment/soundcheck-app \
  BILLING_API_URL="https://acp-middleware-account-billing-system-prod.apps.prod-ocp4.corp.cableone.net" \
  CM_INFO_API_URL="http://phoenix.polling.corp.cableone.net:4402"

# Expose the service as a route
oc expose svc/soundcheck-app

# Get the route URL
oc get route soundcheck-app
```

### Environment Variables Reference

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `VITE_SUPABASE_URL` | Build-time | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build-time | Yes | Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | Build-time | Yes | Supabase project ID |
| `BILLING_API_URL` | Runtime | Yes* | Internal URL for Billing API proxy |
| `CM_INFO_API_URL` | Runtime | Yes* | Internal URL for CM Info API proxy |

*Required for real API access; without them, the proxy returns 503 and the app uses mock data.

See `.env.example` for the full template.

### OpenShift ConfigMap Example

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: soundcheck-config
data:
  BILLING_API_URL: "https://acp-middleware-account-billing-system-prod.apps.prod-ocp4.corp.cableone.net"
  CM_INFO_API_URL: "http://phoenix.polling.corp.cableone.net:4402"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: soundcheck-app
spec:
  template:
    spec:
      containers:
        - name: soundcheck-app
          envFrom:
            - configMapRef:
                name: soundcheck-config
```

### Technical Notes

- **Port 8080**: OpenShift runs containers as non-root; port 8080 is above 1024 and doesn't require root
- **Build-time variables**: Vite embeds `VITE_*` variables at build time, so different environments need separate image builds
- **Runtime variables**: `BILLING_API_URL` and `CM_INFO_API_URL` are read by the Vite preview server at startup
- **SPA routing**: Vite preview handles client-side routing automatically
- **Multi-service proxy**: `/api/{service}/*` requests are forwarded server-side to their respective internal APIs

---

## Editing the Code

- **Lovable**: Visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting
- **Local IDE**: Clone the repo and push changes
- **GitHub**: Edit files directly or use Codespaces
