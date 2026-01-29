

# Change Target Configuration to IP-Based Device Lookup

## Overview
Replace the current MAC/IP dropdown selection with a simplified flow where the user enters an IP address, and on blur, the system fetches device information (MAC address, Make, Model) from the SpreeDB CM Info API.

---

## Architecture

```text
+------------------+     +---------------------------+     +-------------------+
|   React Web App  |     |  OpenShift Pod            |     |  SpreeDB CM API   |
|   (Browser)      |     |  (poller-service + API)   |     |  (Internal)       |
+------------------+     +---------------------------+     +-------------------+
        |                        |                              |
        | 1. User enters IP      |                              |
        |    (onBlur triggers)   |                              |
        +----------------------->|                              |
        | GET /api/devices/:ip   |                              |
        |                        | 2. Forward to SpreeDB        |
        |                        +----------------------------->|
        |                        | GET /cm/info/{ip}            |
        |                        |<-----------------------------+
        |                        | 3. Transform & return        |
        | 4. Display device info |                              |
        |<-----------------------+                              |
        | (MAC, Make, Model)     |                              |
```

---

## Implementation Plan

### 1. Add New Device Info Endpoint to Poller Service

Create a new module and endpoint to fetch device information from the SpreeDB CM Info API.

**New Endpoint:** `GET /api/devices/:ipAddress`

**API Called:** `http://phoenix.polling.corp.cableone.net:4402/cm/info/{ipAddress}`

**Response Mapping:**

| SpreeDB Field | Frontend Field | Description |
|---------------|----------------|-------------|
| `ifPhysAddress` | `macAddress` | Device MAC address |
| `sysName` | `model` | Short model name (e.g., "CVA4004TCH1") |
| `sysDescr` | `make` | Extracted vendor (e.g., "Technicolor") |
| `docsIfDocsisBaseCapability` | `docsisVersion` | DOCSIS version |
| `sysUpTime` | `uptime` | Device uptime |
| `error` | (for error handling) | Check if device not found |

### 2. Update Frontend Form

**Remove:**
- Target Type dropdown (MAC/IP selector)
- Conditional MAC Address field

**Replace with:**
- Single IP Address input field
- On blur validation to fetch device info
- Display panel showing MAC address, Make, and Model

### 3. Type Definitions

**New Types for Device Info:**

```typescript
// poller-service/src/types.ts
interface DeviceInfoResponse {
  docsDevSerialNumber: string;
  docsDevSwCurrentVers: string;
  docsIfDocsisBaseCapability: string;
  error: string;
  ifPhysAddress: string;
  sysDescr: string;
  sysName: string;
  sysUpTime: string;
}

interface DeviceInfo {
  ipAddress: string;
  macAddress: string;
  make: string;
  model: string;
  serialNumber: string;
  docsisVersion: string;
  firmwareVersion: string;
  uptime: string;
}

interface DeviceValidationResult {
  success: boolean;
  device?: DeviceInfo;
  error?: {
    code: string;
    message: string;
  };
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `poller-service/src/device.ts` | SpreeDB CM Info API client |
| `src/lib/device-validation.ts` | Frontend API client for device lookup |

## Files to Modify

| File | Changes |
|------|---------|
| `poller-service/src/api.ts` | Add `/api/devices/:ipAddress` endpoint |
| `poller-service/src/types.ts` | Add device info types |
| `poller-service/.env.example` | Document CM_INFO_API_BASE_URL |
| `src/pages/CreateJob.tsx` | Replace MAC/IP selector with IP + device lookup |
| `.env.example` | No changes needed (uses same VITE_POLLER_SERVICE_URL) |

---

## Detailed Implementation

### Backend: Device Info Module (`poller-service/src/device.ts`)

```typescript
const CM_INFO_API_BASE_URL = process.env.CM_INFO_API_BASE_URL || 
  'http://phoenix.polling.corp.cableone.net:4402';

interface CmInfoResponse {
  docsDevSerialNumber: string;
  docsDevSwCurrentVers: string;
  docsIfDocsisBaseCapability: string;
  error: string;
  ifPhysAddress: string;
  sysDescr: string;
  sysName: string;
  sysUpTime: string;
}

function extractMakeFromDescription(sysDescr: string): string {
  // Example: "Technicolor CVA4004TCH1 DOCSIS 3.1 Cable Modem <<HW_REV: ...>>"
  // Extract first word which is typically the vendor
  const match = sysDescr.match(/^(\w+)/);
  return match ? match[1] : 'Unknown';
}

export async function getDeviceInfo(ipAddress: string): Promise<DeviceValidationResult> {
  const url = `${CM_INFO_API_BASE_URL}/cm/info/${encodeURIComponent(ipAddress)}`;
  
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(10000) 
    });
    
    const data: CmInfoResponse = await response.json();
    
    // Check if device was found (empty ifPhysAddress means not found)
    if (!data.ifPhysAddress || data.error === 'SNMP Timeout.') {
      return {
        success: false,
        error: {
          code: 'DEVICE_NOT_FOUND',
          message: data.error || 'No device found at this IP address',
        },
      };
    }
    
    return {
      success: true,
      device: {
        ipAddress,
        macAddress: data.ifPhysAddress,
        make: extractMakeFromDescription(data.sysDescr),
        model: data.sysName,
        serialNumber: data.docsDevSerialNumber,
        docsisVersion: data.docsIfDocsisBaseCapability,
        firmwareVersion: data.docsDevSwCurrentVers,
        uptime: data.sysUpTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: 'Failed to fetch device information',
      },
    };
  }
}
```

### Backend: API Endpoint Update (`poller-service/src/api.ts`)

Add new endpoint:

```typescript
app.get('/api/devices/:ipAddress', async (req, res) => {
  const { ipAddress } = req.params;
  
  // Validate IP format
  if (!isValidIpAddress(ipAddress)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_IP', message: 'Invalid IP address format' },
    });
  }
  
  const result = await getDeviceInfo(ipAddress);
  res.json(result);
});
```

### Frontend: Device Validation Client (`src/lib/device-validation.ts`)

```typescript
const POLLER_SERVICE_URL = import.meta.env.VITE_POLLER_SERVICE_URL;

export interface DeviceInfo {
  ipAddress: string;
  macAddress: string;
  make: string;
  model: string;
  serialNumber?: string;
  docsisVersion?: string;
  firmwareVersion?: string;
  uptime?: string;
}

export interface DeviceValidationResult {
  success: boolean;
  device?: DeviceInfo;
  error?: { code: string; message: string };
  source: 'api' | 'mock';
}

export async function validateDevice(ipAddress: string): Promise<DeviceValidationResult> {
  if (POLLER_SERVICE_URL) {
    try {
      const response = await fetch(
        `${POLLER_SERVICE_URL}/api/devices/${encodeURIComponent(ipAddress)}`
      );
      const result = await response.json();
      return { ...result, source: 'api' };
    } catch (error) {
      console.warn('Device API failed, using mock');
    }
  }
  
  // Mock fallback for development
  return mockDeviceLookup(ipAddress);
}

function mockDeviceLookup(ipAddress: string): DeviceValidationResult {
  // Simple mock - any valid IP returns mock device
  return {
    success: true,
    device: {
      ipAddress,
      macAddress: '00:1A:2B:3C:4D:5E',
      make: 'Technicolor',
      model: 'CVA4004TCH1',
      serialNumber: 'MOCK123456',
      docsisVersion: 'docsis31',
    },
    source: 'mock',
  };
}
```

### Frontend: Updated CreateJob Form

**Key Changes to `src/pages/CreateJob.tsx`:**

1. **Remove** `targetType` field from schema
2. **Replace** `targetMac` and `targetIp` with just `targetIp` (required)
3. **Add** new state for device validation:
   ```typescript
   const [deviceData, setDeviceData] = useState<DeviceInfo | null>(null);
   const [deviceError, setDeviceError] = useState<string | null>(null);
   const [isValidatingDevice, setIsValidatingDevice] = useState(false);
   ```

4. **Add** `handleValidateDevice` function triggered on blur:
   ```typescript
   async function handleValidateDevice() {
     const ip = form.getValues('targetIp');
     if (!ip || !isValidIpAddress(ip)) return;
     
     setIsValidatingDevice(true);
     const result = await validateDevice(ip);
     
     if (result.success && result.device) {
       setDeviceData(result.device);
       // Auto-populate MAC in form (hidden)
       form.setValue('targetMac', result.device.macAddress);
     } else {
       setDeviceError(result.error?.message || 'Device not found');
     }
     setIsValidatingDevice(false);
   }
   ```

5. **Update** Target Configuration card UI:
   - Single IP input with `onBlur={handleValidateDevice}`
   - Device info display showing MAC, Make, Model
   - Loading spinner during validation

---

## Updated Form Schema

```typescript
const jobFormSchema = z.object({
  accountNumber: z.string().min(9).max(12),
  targetIp: z.string().refine(isValidIpAddress, 'Invalid IP address'),
  targetMac: z.string().optional(), // Auto-populated from device lookup
  durationMinutes: z.number().min(1),
  cadenceSeconds: z.number().min(10),
  reason: z.enum(['reactive', 'proactive']),
  notificationEmail: z.string().email(),
  alertOnOffline: z.boolean(),
  alertOnRecovery: z.boolean(),
  monitoringMode: z.enum(['simulated', 'real_polling']),
});
```

---

## UI Design for Device Info Display

When device lookup succeeds:

```
+---------------------------------------------------+
| Target Configuration                              |
+---------------------------------------------------+
| Management IP Address                             |
| [10.117.224.95                           ] [✓]    |
|                                                   |
| +-----------------------------------------------+ |
| | ✓ Device Found                                | |
| |                                               | |
| | MAC Address:    10:A7:93:46:5A:FD             | |
| | Make:           Technicolor                    | |
| | Model:          CVA4004TCH1                    | |
| | DOCSIS:         3.1                            | |
| +-----------------------------------------------+ |
+---------------------------------------------------+
```

When device not found:

```
+---------------------------------------------------+
| Target Configuration                              |
+---------------------------------------------------+
| Management IP Address                             |
| [10.0.0.99                               ] [⚠]   |
|                                                   |
| ⚠ No device found at this IP address (SNMP      |
|   Timeout). Please verify the IP is correct.     |
+---------------------------------------------------+
```

---

## Implementation Sequence

1. Add device info types to `poller-service/src/types.ts`
2. Create `poller-service/src/device.ts` with CM Info API client
3. Add `/api/devices/:ipAddress` endpoint to `poller-service/src/api.ts`
4. Update `poller-service/.env.example` with CM_INFO_API_BASE_URL
5. Create `src/lib/device-validation.ts` frontend client
6. Update `src/pages/CreateJob.tsx`:
   - Modify form schema
   - Add device validation state and handler
   - Replace Target Configuration UI
7. Update form submission to include auto-populated MAC

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `poller-service/src/device.ts` | Create | CM Info API client |
| `poller-service/src/types.ts` | Modify | Add device types |
| `poller-service/src/api.ts` | Modify | Add device endpoint |
| `poller-service/.env.example` | Modify | Add CM_INFO_API_BASE_URL |
| `src/lib/device-validation.ts` | Create | Frontend device lookup |
| `src/pages/CreateJob.tsx` | Modify | New target UI with onBlur validation |

