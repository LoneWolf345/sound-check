

# Docker-Based OpenShift Deployment for Sound Check

## Overview
This plan implements Docker containerization for the Vite + React + TypeScript application, using a multi-stage build with Node.js for building and Nginx for serving the static assets.

---

## Files to Create

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: Node build + Nginx runtime |
| `nginx.conf` | Nginx configuration for SPA routing with port 8080 |
| `.dockerignore` | Exclude unnecessary files from Docker context |
| `.env.example` | Document all required build-time environment variables |

## Files to Modify

| File | Changes |
|------|---------|
| `README.md` | Add Docker build/run instructions and deployment diagram |

---

## Implementation Details

### 1. Dockerfile (Multi-Stage Build)

**Stage 1: Build**
- Base: `node:22-alpine` (latest stable LTS)
- Install dependencies with `npm ci`
- Build with `npm run build`
- Pass build-time environment variables via `ARG`

**Stage 2: Runtime**
- Base: `nginx:alpine`
- Copy built assets from build stage to `/usr/share/nginx/html`
- Copy custom nginx config
- Expose port 8080 (OpenShift requirement - non-root)
- Run nginx in foreground

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
RUN npm run build

# Runtime stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

### 2. Nginx Configuration

Key features:
- Listen on port 8080 (OpenShift non-root compatible)
- Serve static files from `/usr/share/nginx/html`
- SPA fallback: `try_files $uri $uri/ /index.html`
- Gzip compression for assets
- Proper caching headers for static assets

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing - fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
```

### 3. .dockerignore

Exclude development files to reduce build context size:

```
node_modules
dist
.git
.gitignore
*.md
.env
.env.*
!.env.example
*.log
.vscode
.idea
poller-service/node_modules
```

### 4. .env.example (Build-Time Variables)

Document all environment variables the app needs at build time:

```bash
# Supabase Configuration (required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
VITE_SUPABASE_PROJECT_ID=your-project-id

# Optional: Additional API endpoints
# VITE_API_BASE_URL=https://api.example.com
```

### 5. README.md Updates

Add a new section for Docker deployment:

**Docker Build/Run Instructions:**
```bash
# Build the image with environment variables
docker build \
  --build-arg VITE_SUPABASE_URL="https://xxx.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="your-key" \
  --build-arg VITE_SUPABASE_PROJECT_ID="your-project-id" \
  -t soundcheck-app:latest .

# Run locally for testing
docker run -p 8080:8080 soundcheck-app:latest
```

**Mermaid Deployment Diagram:**
```
sequenceDiagram
    participant Dev as Developer
    participant Docker as Docker Build
    participant Registry as Container Registry
    participant OCP as OpenShift

    Dev->>Docker: docker build --build-arg VITE_*
    Docker->>Docker: npm ci && npm run build
    Docker->>Docker: Copy dist to nginx
    Docker->>Registry: docker push
    Registry->>OCP: oc new-app / deploy
    OCP->>OCP: Run container on port 8080
    OCP-->>Dev: App available at route
```

---

## Technical Notes

### Port 8080 Rationale
OpenShift runs containers as non-root by default. Port 8080 is:
- Above 1024 (no root required)
- Standard for OpenShift web applications
- Already used by Vite dev server (consistent)

### Build-Time vs Runtime Environment Variables
Vite embeds `VITE_*` variables at build time into the JavaScript bundle. This means:
- Variables must be passed as `--build-arg` during `docker build`
- Different environments need separate image builds
- This is standard for Vite/React apps

### SPA Routing
The nginx config uses `try_files $uri $uri/ /index.html` to:
- Serve static files if they exist
- Fall back to `index.html` for client-side routing
- Essential for React Router to work properly

---

## File Summary

| File | Action | Lines |
|------|--------|-------|
| `Dockerfile` | Create | ~30 |
| `nginx.conf` | Create | ~25 |
| `.dockerignore` | Create | ~15 |
| `.env.example` | Create | ~10 |
| `README.md` | Modify | Add ~60 lines |

