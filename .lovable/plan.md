

# Updated Plan: Fix Build Errors and Improve Dockerfile

## Problem Analysis

The build is failing due to two issues:

1. **Lock file out of sync** - `package-lock.json` is missing transitive dependencies required by `package.json`
2. **Dockerfile improvements needed** - The current Dockerfile has issues compared to the working reference

## Key Differences from Working Dockerfile

| Aspect | Current Dockerfile | Working Reference |
|--------|-------------------|-------------------|
| Node version | `node:22-alpine` (latest) | `node:20.11-alpine3.19` (specific) |
| Work directory | `/app` | `/opt/app-root/src` |
| npm cache setup | Not configured | Explicit cache directory |
| OpenShift UID | Simple `adduser -u 1001` | Full arbitrary UID support with `g=u` permissions |
| npm ci flags | `npm ci` | `npm ci --no-cache` |
| Healthcheck | None | Proper curl healthcheck |
| OpenShift labels | None | Proper k8s/OpenShift labels |
| CMD format | `npx vite preview` | `npm run preview -- --host --port` |
| Extra vite install | Manually installs vite plugins | Uses existing devDeps from npm ci |

## Solution

### Step 1: Regenerate package-lock.json

Delete and regenerate the lock file to fix the synchronization issue:

```bash
rm package-lock.json
npm install
```

This resolves all missing dependencies (`@testing-library/dom`, `picomatch`, etc.).

### Step 2: Update Dockerfile with Best Practices

Apply patterns from the working Dockerfile:

```dockerfile
# Build stage
FROM node:20.11-alpine3.19 AS builder

# Create app directory structure (OpenShift standard)
WORKDIR /opt/app-root/src

# Copy package files
COPY package*.json ./

# Install all dependencies with cache disabled
RUN npm ci --no-cache

# Copy source code
COPY . .

# Build-time environment variables for Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

# Build the application
RUN npm run build

# Production stage
FROM node:20.11-alpine3.19 AS production

# Create OpenShift-compatible directory structure and npm cache directory
RUN mkdir -p /opt/app-root/src \
    /opt/app-root/home \
    /opt/app-root/home/.npm \
    /tmp && \
    chmod -R 775 /opt/app-root && \
    chmod -R 775 /opt/app-root/home/.npm && \
    chmod -R 775 /tmp

WORKDIR /opt/app-root/src

# Set environment variables including npm cache location
ENV HOME=/opt/app-root/home \
    NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_CACHE=/opt/app-root/home/.npm \
    POLLER_API_URL=""

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --no-cache

# Copy built assets from builder stage
COPY --from=builder /opt/app-root/src/dist ./dist

# Copy Vite configuration (needed for preview command with proxy)
COPY vite.config.ts ./

# Install curl for healthcheck
RUN apk --no-cache add curl

# Set permissions for OpenShift arbitrary user ID support
RUN chown -R 1002290000:0 /opt/app-root && \
    chmod -R g=u /opt/app-root && \
    chown -R 1002290000:0 /opt/app-root/home/.npm && \
    chmod -R g=u /opt/app-root/home/.npm && \
    chown -R 1002290000:0 /tmp && \
    chmod -R g=u /tmp

# Switch to unprivileged user
USER 1002290000

# OpenShift-specific labels
LABEL io.openshift.expose-services="8080:http" \
      io.k8s.description="Sound Check - Network Testing Dashboard" \
      io.openshift.tags="nodejs,vite,react" \
      io.openshift.non-scalable="false" \
      io.k8s.display-name="sound-check"

# Expose port
EXPOSE 8080

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# Start the application
CMD ["npm", "run", "preview", "--", "--host", "--port", "8080"]
```

### Key Issue: Vite Plugin Dependencies

There's one difference between our project and the reference: our `vite.config.ts` imports:
- `@vitejs/plugin-react-swc` (devDependency)
- `lovable-tagger` (devDependency)

The reference project must have these in production dependencies or doesn't need them for preview mode. We need to either:

**Option A**: Move vite plugins to production dependencies
**Option B**: Keep the current approach of installing them in the runtime stage

I recommend **Option A** - moving the required plugins to `dependencies` so `npm ci --omit=dev` includes them.

### Step 3: Update package.json Dependencies

Move Vite-related packages from devDependencies to dependencies:

```json
{
  "dependencies": {
    // ... existing deps
    "vite": "^5.4.19",
    "@vitejs/plugin-react-swc": "^3.11.0",
    "lovable-tagger": "^1.1.13"
  },
  "devDependencies": {
    // Remove vite, @vitejs/plugin-react-swc, lovable-tagger from here
  }
}
```

## Files to Modify

| File | Change |
|------|--------|
| `package-lock.json` | Regenerate (delete + npm install) |
| `Dockerfile` | Apply OpenShift best practices from working example |
| `package.json` | Move vite plugins to dependencies |

## Summary

The plan remains valid but is enhanced with:
1. **Specific Node version** (`20.11-alpine3.19`) for consistency
2. **Proper OpenShift directory structure** (`/opt/app-root/src`)
3. **npm cache configuration** for arbitrary UID support
4. **Healthcheck** for production readiness
5. **OpenShift labels** for better cluster integration
6. **g=u permissions** for arbitrary UID compatibility
7. **Cleaner dependency management** - move runtime-needed plugins to dependencies

