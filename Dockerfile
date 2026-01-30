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
