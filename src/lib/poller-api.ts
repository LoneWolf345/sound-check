// Poller API Configuration
// Determines the correct base URL for poller service API calls

const VITE_POLLER_SERVICE_URL = import.meta.env.VITE_POLLER_SERVICE_URL;

/**
 * Get the effective base URL for poller API calls
 * - In production: Use `/api/poller` (proxied through Vite preview server)
 * - In development: Use VITE_POLLER_SERVICE_URL directly, or empty for mock fallback
 */
export function getPollerBaseUrl(): string {
  if (import.meta.env.PROD) {
    return '/api/poller';  // Proxied through Vite preview
  }
  return VITE_POLLER_SERVICE_URL || '';
}

/**
 * Check if the poller API is available
 * - In production: Always available (through proxy)
 * - In development: Only if VITE_POLLER_SERVICE_URL is set
 */
export function isPollerApiConfigured(): boolean {
  if (import.meta.env.PROD) {
    return true;  // Proxy availability is a runtime concern
  }
  return Boolean(VITE_POLLER_SERVICE_URL);
}
