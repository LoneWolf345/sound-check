import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Poller Proxy Plugin
 * 
 * In preview mode (production), this middleware intercepts requests to /api/poller/*
 * and forwards them to the internal poller service. This eliminates CORS issues
 * by making server-to-server requests instead of browser-to-server.
 * 
 * Request flow:
 * Browser -> /api/poller/accounts/123 -> Vite Preview -> POLLER_API_URL/api/accounts/123
 */
function pollerProxyPlugin(): Plugin {
  return {
    name: 'poller-proxy',
    configurePreviewServer(server) {
      // Read runtime env var (not VITE_ prefixed - this is server-side at runtime)
      const POLLER_API_URL = process.env.POLLER_API_URL;
      
      if (POLLER_API_URL) {
        console.log(`[Proxy] Poller API proxy configured: /api/poller/* -> ${POLLER_API_URL}/api/*`);
      } else {
        console.warn('[Proxy] POLLER_API_URL not set, /api/poller/* will return 503');
      }
      
      server.middlewares.use('/api/poller', async (req, res) => {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
          res.statusCode = 204;
          res.end();
          return;
        }
        
        if (!POLLER_API_URL) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            success: false,
            error: { code: 'PROXY_NOT_CONFIGURED', message: 'Backend proxy not configured' }
          }));
          return;
        }
        
        // Forward to internal poller service
        // /api/poller/accounts/123 -> POLLER_API_URL/api/accounts/123
        const targetUrl = `${POLLER_API_URL}/api${req.url}`;
        
        try {
          console.log(`[Proxy] ${req.method} ${req.url} -> ${targetUrl}`);
          
          const response = await fetch(targetUrl, {
            method: req.method || 'GET',
            headers: { 
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
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
      });
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
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    pollerProxyPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
