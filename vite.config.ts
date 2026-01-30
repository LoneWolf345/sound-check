import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Multi-Service Proxy Plugin
 * 
 * In preview mode (production), this middleware intercepts requests to /api/{service}/*
 * and forwards them to internal service URLs. This eliminates CORS issues
 * by making server-to-server requests instead of browser-to-server.
 * 
 * Request flow:
 * Browser -> /api/billing/accounts/123 -> Vite Preview -> BILLING_API_URL/accounts/123
 * Browser -> /api/cm/info/10.1.2.3 -> Vite Preview -> CM_INFO_API_URL/cm/info/10.1.2.3
 */

interface ServiceConfig {
  name: string;
  envVar: string;
  pathPrefix: string; // What to prepend to the forwarded path (empty string = use req.url as-is)
}

const SERVICES: ServiceConfig[] = [
  { name: 'billing', envVar: 'BILLING_API_URL', pathPrefix: '' },
  { name: 'cm', envVar: 'CM_INFO_API_URL', pathPrefix: '/cm' },
];

function createProxyHandler(targetUrl: string, pathPrefix: string) {
  return async (req: any, res: any) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
      res.statusCode = 204;
      res.end();
      return;
    }

    // Build target URL: targetUrl + pathPrefix + req.url
    // e.g., /api/cm/info/10.1.2.3 -> CM_INFO_API_URL + /cm + /info/10.1.2.3
    const forwardUrl = `${targetUrl}${pathPrefix}${req.url}`;

    try {
      console.log(`[Proxy] ${req.method} ${req.originalUrl} -> ${forwardUrl}`);

      // Collect request body for POST/PUT/PATCH
      let body: string | undefined;
      if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString();
      }

      const response = await fetch(forwardUrl, {
        method: req.method || 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body,
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
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        success: false,
        error: { code: 'PROXY_ERROR', message: 'Failed to reach backend service' }
      }));
    }
  };
}

function multiServiceProxyPlugin(): Plugin {
  return {
    name: 'multi-service-proxy',
    configurePreviewServer(server) {
      console.log('[Proxy] Configuring multi-service proxy...');

      for (const service of SERVICES) {
        const targetUrl = process.env[service.envVar];

        if (targetUrl) {
          const route = `/api/${service.name}`;
          console.log(`[Proxy] ${route}/* -> ${targetUrl}${service.pathPrefix}/*`);
          server.middlewares.use(route, createProxyHandler(targetUrl, service.pathPrefix));
        } else {
          console.warn(`[Proxy] ${service.envVar} not set, /api/${service.name}/* will return 503`);
          server.middlewares.use(`/api/${service.name}`, (req: any, res: any) => {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({
              success: false,
              error: { code: 'PROXY_NOT_CONFIGURED', message: `${service.name} proxy not configured` }
            }));
          });
        }
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    host: "::",
    port: 8080,
    allowedHosts: true, // Allow all hosts (needed for OpenShift dynamic hostnames)
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    multiServiceProxyPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
