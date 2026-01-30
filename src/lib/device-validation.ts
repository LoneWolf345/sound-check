// Device Validation Client
// Fetches device information from the CM Info API (SpreeDB) with mock fallback

import { isValidIpAddress } from './format';
import { getServiceBaseUrl, isServiceConfigured } from './api-services';

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
  error?: {
    code: string;
    message: string;
  };
  source: 'api' | 'mock';
}

/**
 * Check if the real device API is configured
 */
export function isDeviceApiConfigured(): boolean {
  return isServiceConfigured('cm');
}

/**
 * Validate a device by its IP address
 * Attempts to call the real API first, falls back to mock if unavailable
 */
export async function validateDevice(ipAddress: string): Promise<DeviceValidationResult> {
  // Basic IP validation
  if (!ipAddress || !isValidIpAddress(ipAddress)) {
    return {
      success: false,
      error: {
        code: 'INVALID_IP',
        message: 'Please enter a valid IP address',
      },
      source: 'mock',
    };
  }

  const baseUrl = getServiceBaseUrl('cm');

  // Try real API if configured
  if (baseUrl) {
    try {
      // CM Info API path: /cm/info/{ip}
      // With proxy: /api/cm/info/{ip} -> CM_INFO_API_URL/cm/info/{ip}
      const response = await fetch(
        `${baseUrl}/info/${encodeURIComponent(ipAddress)}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      const result = await response.json();
      return { ...result, source: 'api' as const };
    } catch (error) {
      console.warn('[DeviceValidation] Real API failed, falling back to mock:', error);
    }
  }

  // Mock fallback for development
  return mockDeviceLookup(ipAddress);
}

/**
 * Mock device lookup for development/testing
 * Returns a mock device for any valid IP address
 */
async function mockDeviceLookup(ipAddress: string): Promise<DeviceValidationResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // For testing: IPs ending in .1 return "not found"
  if (ipAddress.endsWith('.1')) {
    return {
      success: false,
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: 'SNMP Timeout. No device found at this IP address.',
      },
      source: 'mock',
    };
  }

  // Return mock device data
  return {
    success: true,
    device: {
      ipAddress,
      macAddress: '10:A7:93:46:5A:FD',
      make: 'Technicolor',
      model: 'CVA4004TCH1',
      serialNumber: 'CP2328AU049',
      docsisVersion: '3.1',
      firmwareVersion: 'CVA4004TCH1-21.3-007-MT1-241129',
      uptime: '2:8:08:41.00',
    },
    source: 'mock',
  };
}
