// Express HTTP API Server for Sound Check Poller Service
// Exposes endpoints for account validation and health checks

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { validateAccount } from './billing.js';
import { getDeviceInfo } from './device.js';

const app = express();

// CORS configuration - in production, restrict to app domain
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));

app.use(express.json());

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

/**
 * Health check endpoint
 * GET /api/health
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'soundcheck-poller',
    version: process.env.npm_package_version || '1.0.0',
  });
});

/**
 * Account validation endpoint
 * GET /api/accounts/:accountNumber
 */
app.get('/api/accounts/:accountNumber', async (req: Request, res: Response) => {
  const { accountNumber } = req.params;
  
  // Basic input validation
  if (!accountNumber || accountNumber.length < 9) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Account number must be at least 9 characters',
      },
    });
    return;
  }
  
  // Only allow alphanumeric characters
  if (!/^[a-zA-Z0-9]+$/.test(accountNumber)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Account number must contain only alphanumeric characters',
      },
    });
    return;
  }
  
  try {
    const result = await validateAccount(accountNumber);
    
    // Return appropriate status code based on result
    if (result.success) {
      res.json(result);
    } else if (result.error?.code === 'ACCOUNT_NOT_FOUND') {
      res.status(404).json(result);
    } else {
      res.status(502).json(result);
    }
  } catch (error) {
    console.error(`[API] Error validating account ${accountNumber}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * Device info endpoint
 * GET /api/devices/:ipAddress
 */
app.get('/api/devices/:ipAddress', async (req: Request, res: Response) => {
  const { ipAddress } = req.params;
  
  // Validate IP address format
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipAddress || !ipRegex.test(ipAddress)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_IP',
        message: 'Invalid IP address format',
      },
    });
    return;
  }
  
  try {
    const result = await getDeviceInfo(ipAddress);
    
    // Return appropriate status code based on result
    if (result.success) {
      res.json(result);
    } else if (result.error?.code === 'DEVICE_NOT_FOUND') {
      res.status(404).json(result);
    } else {
      res.status(502).json(result);
    }
  } catch (error) {
    console.error(`[API] Error fetching device info for ${ipAddress}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * 404 handler for unknown routes
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

/**
 * Start the API server on the specified port
 */
export function startApiServer(port: number = 3001): void {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[API] Server listening on port ${port}`);
    console.log(`[API] Health check: http://localhost:${port}/api/health`);
  });
}

export { app };
