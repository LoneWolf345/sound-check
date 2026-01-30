# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci

# Copy source files
COPY . .

# Build-time environment variables for Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

# Build the application
RUN npm run build

# Runtime stage - Vite Preview with proxy middleware
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy built assets and required config files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/vite.config.ts ./
COPY --from=builder /app/tsconfig*.json ./

# Install vite and its dependencies for preview mode
# Note: We need vite, @vitejs/plugin-react-swc, and lovable-tagger for the config
RUN npm ci --omit=dev && \
    npm install vite @vitejs/plugin-react-swc lovable-tagger

# Runtime env var for proxy (not VITE_ - it's server-side only)
# Set via OpenShift ConfigMap/Secret or docker run -e
ENV POLLER_API_URL=""

# Set proper permissions for OpenShift (runs as non-root)
RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port 8080 (non-privileged port for OpenShift)
EXPOSE 8080

# Run Vite preview server with proxy middleware
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "8080"]
