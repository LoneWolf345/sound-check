

# Add Real Account Validation via Billing API

## Overview
Integrate the internal ACP Middleware Account Billing API to validate customer accounts and retrieve service information. Since the billing API is on the internal network (like the SpreeDB poller), the request flow must go through the OpenShift pod.

---

## Architecture

```text
+------------------+     +-------------------+     +-------------------------+
|   React Web App  |     |  Supabase Edge    |     |  OpenShift Pod          |
|   (Browser)      |     |  Function (Proxy) |     |  (poller-service)       |
+------------------+     +-------------------+     +-------------------------+
        |                        |                           |
        |  1. Validate Account   |                           |
        +----------------------->|                           |
        |  (POST /validate-acct) |                           |
        |                        |  2. Forward request       |
        |                        +-------------------------->|
        |                        |  (via internal network)   |
        |                        |                           |
        |                        |                   3. Call Billing API
        |                        |                           +--------+
        |                        |                           |        |
        |                        |  4. Return response       |<-------+
        |                        |<--------------------------+
        |  5. Display result     |                           |
        |<-----------------------+                           |
```

**Wait - Edge Functions can't reach internal networks either!**

After further consideration, the edge function won't be able to reach the OpenShift pod directly. Instead, we need to:

**Option A**: Expose the poller-service as an HTTP API and call it directly from the browser (requires CORS on poller-service)

**Option B**: Call the billing API directly from the poller-service which runs on the internal network, and expose an endpoint

Since the poller-service is already running on the internal network and can access internal APIs, the cleanest approach is:

```text
+------------------+     +---------------------------+     +-------------------+
|   React Web App  |     |  OpenShift Pod            |     |  Billing API      |
|   (Browser)      |     |  (poller-service + API)   |     |  (Internal)       |
+------------------+     +---------------------------+     +-------------------+
        |                        |                              |
        |  1. Validate Account   |                              |
        +----------------------->|                              |
        |  GET /api/accounts/:id |                              |
        |                        |  2. Forward to Billing API   |
        |                        +----------------------------->|
        |                        |                              |
        |                        |<-----------------------------+
        |                        |  3. Transform & return       |
        |  4. Display result     |                              |
        |<-----------------------+                              |
```

---

## Implementation Plan

### 1. Extend Poller Service with HTTP API

Transform the poller-service from a background worker into a dual-purpose service:
- **Background Worker**: Continues polling jobs (existing functionality)
- **HTTP API**: Exposes endpoints for account validation

**New Dependencies:**
- `express` - HTTP server framework
- `cors` - CORS middleware for browser access

**New Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/accounts/:accountNumber` | GET | Validate account and return billing info |
| `/api/health` | GET | Health check endpoint |

### 2. Create Account Validation Module

New file: `poller-service/src/billing.ts`

Maps the billing API response to a simplified format for the frontend:

**Input**: Account number (e.g., `8160400020005238`)

**API Call**: `GET https://acp-middleware-account-billing-system-prod.apps.prod-ocp4.corp.cableone.net/accounts/{accountNumber}`

**Output**:
```typescript
interface ValidatedAccount {
  accountNumber: string;
  customerName: string;        // first_name + last_name or business_name
  customerType: string;        // customer_type (e.g., "residential", "business")
  accountStatus: string;       // account_status
  serviceAddress: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
  services: {
    video: boolean;
    hsd: boolean;              // High-Speed Data (internet)
    phone: boolean;
  };
  nodeId: string | null;       // For network identification
  primaryPhone: string | null;
  email: string | null;
}
```

**Error Handling**:
- 404 from billing API -> Return `{ error: "ACCOUNT_NOT_FOUND", message: "..." }`
- 500/timeout -> Return `{ error: "API_ERROR", message: "..." }`

### 3. Update Frontend Mock to Support Real API

Modify `src/lib/mock-data.ts` to:
1. Add a new `validateAccount` function that calls the poller-service API
2. Keep `mockValidateAccount` as fallback for development/testing
3. Add configuration for poller-service URL

### 4. Update CreateJob Page

Modify validation to:
1. Try real API first (if configured)
2. Fall back to mock if API unavailable
3. Display richer account information from real API

### 5. Add Environment Configuration

**New Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `BILLING_API_BASE_URL` | Internal billing API URL | `https://acp-middleware-account-billing-system-prod.apps.prod-ocp4.corp.cableone.net` |
| `API_SERVER_PORT` | Port for HTTP API | `3001` |
| `VITE_POLLER_SERVICE_URL` | Poller service URL for frontend | `http://soundcheck-api.apps.prod-ocp4.corp.cableone.net` |

---

## Files to Create

| File | Purpose |
|------|---------|
| `poller-service/src/billing.ts` | Billing API client |
| `poller-service/src/api.ts` | Express HTTP API server |

## Files to Modify

| File | Changes |
|------|---------|
| `poller-service/package.json` | Add express, cors dependencies |
| `poller-service/src/index.ts` | Start HTTP API alongside polling worker |
| `poller-service/src/types.ts` | Add billing API types |
| `poller-service/.env.example` | Add new environment variables |
| `src/lib/mock-data.ts` | Add real API client with fallback |
| `src/pages/CreateJob.tsx` | Use real validation, display richer info |

---

## Detailed Type Definitions

### Billing API Response (from your schema)

```typescript
interface BillingApiResponse {
  first_name: string;
  last_name: string;
  customer_name: string;        // For business accounts
  business_name: string;
  customer_type: string;
  customer_sub_type: string;
  account_status: string;
  service_address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    zip: string;
    postal_code: string;
  };
  services: {
    video: boolean;
    hsd: boolean;
    phone: boolean;
  };
  node_id: string;
  primary_phone_number: string;
  email: Array<{
    email_address: string;
    is_primary: boolean;
  }>;
  // ... many more fields we don't need
}

interface BillingApiError {
  code: string;           // "ACCOUNT_NOT_FOUND"
  description: string;    // "Could not find the account..."
}
```

### Transformed Response for Frontend

```typescript
interface AccountValidationResult {
  success: boolean;
  account?: {
    accountNumber: string;
    customerName: string;
    customerType: 'residential' | 'business';
    accountStatus: string;
    serviceAddress: string;    // Formatted single line
    services: {
      video: boolean;
      hsd: boolean;
      phone: boolean;
    };
    nodeId: string | null;
    primaryPhone: string | null;
    primaryEmail: string | null;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

---

## API Server Implementation

### Express Server (`poller-service/src/api.ts`)

```typescript
import express from 'express';
import cors from 'cors';
import { validateAccount } from './billing.js';

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Account validation
app.get('/api/accounts/:accountNumber', async (req, res) => {
  const { accountNumber } = req.params;
  
  if (!accountNumber || accountNumber.length < 9) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Invalid account number' }
    });
  }
  
  try {
    const result = await validateAccount(accountNumber);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'API_ERROR', message: 'Failed to validate account' }
    });
  }
});

export function startApiServer(port: number = 3001) {
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}
```

### Updated Main Entry Point

```typescript
// poller-service/src/index.ts
import { startApiServer } from './api.js';

// ... existing polling code ...

// Start HTTP API server
const API_PORT = parseInt(process.env.API_SERVER_PORT || '3001', 10);
startApiServer(API_PORT);

// Start polling loop
async function main() {
  // ... existing code
}
```

---

## Frontend Integration

### Updated Mock Data / API Client

```typescript
// src/lib/account-validation.ts (new file)
const POLLER_SERVICE_URL = import.meta.env.VITE_POLLER_SERVICE_URL;

export async function validateAccount(accountNumber: string): Promise<AccountValidationResult> {
  // If poller service URL is configured, use real API
  if (POLLER_SERVICE_URL) {
    try {
      const response = await fetch(
        `${POLLER_SERVICE_URL}/api/accounts/${encodeURIComponent(accountNumber)}`
      );
      return await response.json();
    } catch (error) {
      console.warn('Real API failed, falling back to mock:', error);
    }
  }
  
  // Fallback to mock validation
  return mockValidateAccount(accountNumber);
}
```

### Enhanced Account Display

The CreateJob page will display more information from the real API:
- Customer name and type
- Full service address
- Active services (Video, Internet, Phone)
- Account status (with warning for inactive accounts)

---

## Security Considerations

1. **CORS Configuration**: The API server uses CORS to allow browser requests. In production, restrict origins to the app domain.

2. **No Sensitive Data Exposure**: The billing API returns sensitive data (SSN, driver's license). The poller-service transforms the response to only include what the frontend needs.

3. **Internal Network Only**: The billing API is only accessible from the internal network. The poller-service acts as a secure gateway.

4. **Rate Limiting**: Consider adding rate limiting to the API endpoints in production.

---

## Testing

1. **Local Development**: Use mock validation (no `VITE_POLLER_SERVICE_URL` set)
2. **VPN/Internal Network**: Set `VITE_POLLER_SERVICE_URL` to the poller-service endpoint
3. **Production**: Configure the environment variable in the OpenShift deployment

---

## Implementation Sequence

1. Add Express dependencies to poller-service
2. Create billing API client module
3. Create HTTP API server module  
4. Update poller-service entry point to start both services
5. Update environment variable templates
6. Create frontend API client with fallback
7. Update CreateJob page to use new validation
8. Test end-to-end with real API

