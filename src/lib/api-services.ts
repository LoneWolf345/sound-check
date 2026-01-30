// API Service Configuration
// Centralized routing helper for multi-service proxy architecture

type ServiceName = 'billing' | 'cm' | 'latency';

interface ServiceConfig {
  devEnvVar: string;
  prodPath: string;
}

const SERVICES: Record<ServiceName, ServiceConfig> = {
  billing: {
    devEnvVar: 'VITE_BILLING_API_URL',
    prodPath: '/api/billing',
  },
  cm: {
    devEnvVar: 'VITE_CM_INFO_API_URL',
    prodPath: '/api/cm',
  },
  latency: {
    devEnvVar: 'VITE_LATENCY_API_URL',
    prodPath: '/api/latency',
  },
};

/**
 * Get the base URL for a specific service
 * - In production: Returns `/api/{service}` (proxied through Vite preview server)
 * - In development: Returns VITE_{SERVICE}_URL directly, or empty for mock fallback
 */
export function getServiceBaseUrl(service: ServiceName): string {
  const config = SERVICES[service];
  
  if (import.meta.env.PROD) {
    return config.prodPath;
  }
  
  // Development: use direct URL if configured
  const devUrl = import.meta.env[config.devEnvVar] as string | undefined;
  return devUrl || '';
}

/**
 * Check if a specific service API is available
 * - In production: Always true (availability is a runtime concern)
 * - In development: Only if VITE_{SERVICE}_URL is set
 */
export function isServiceConfigured(service: ServiceName): boolean {
  if (import.meta.env.PROD) {
    return true;
  }
  
  const config = SERVICES[service];
  return Boolean(import.meta.env[config.devEnvVar]);
}
