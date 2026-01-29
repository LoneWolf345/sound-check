// SpreeDB CM Info API Client for Device Information Lookup
// Fetches device details (MAC, Make, Model) from management IP address

import type { DeviceInfo, DeviceValidationResult } from './types.js';

const CM_INFO_API_BASE_URL = process.env.CM_INFO_API_BASE_URL || 
  'http://phoenix.polling.corp.cableone.net:4402';

const CM_INFO_TIMEOUT_MS = parseInt(process.env.CM_INFO_TIMEOUT_MS || '10000', 10);

/**
 * Raw response from the SpreeDB CM Info API
 */
interface CmInfoResponse {
  docsDevSerialNumber: string;
  docsDevServerConfigFile: string;
  docsDevSwAdminStatus: string;
  docsDevSwCurrentVers: string;
  docsDevSwFilename: string;
  docsDevSwOperStatus: string;
  docsDevSwServerAddress: string;
  docsDevSwServerAddressType: string;
  docsDevSwServerTransportProtocol: string;
  docsIfDocsisBaseCapability: string;
  error: string;
  ifPhysAddress: string;
  sysDescr: string;
  sysName: string;
  sysUpTime: string;
}

/**
 * Extract the vendor/make from the sysDescr field
 * Example input: "Technicolor CVA4004TCH1 DOCSIS 3.1 Cable Modem <<HW_REV: ...>>"
 * Example output: "Technicolor"
 */
function extractMakeFromDescription(sysDescr: string): string {
  if (!sysDescr) return 'Unknown';
  
  // The first word is typically the vendor name
  const match = sysDescr.match(/^(\w+)/);
  return match ? match[1] : 'Unknown';
}

/**
 * Format DOCSIS version for display
 * Example: "docsis31" -> "3.1"
 */
function formatDocsisVersion(version: string): string {
  if (!version) return '';
  
  // Match patterns like "docsis31", "docsis30", "docsis20"
  const match = version.match(/docsis(\d)(\d)/i);
  if (match) {
    return `${match[1]}.${match[2]}`;
  }
  
  return version;
}

/**
 * Fetch device information from the SpreeDB CM Info API
 * @param ipAddress The management IP address of the device
 * @returns Device validation result with device info or error
 */
export async function getDeviceInfo(ipAddress: string): Promise<DeviceValidationResult> {
  const url = `${CM_INFO_API_BASE_URL}/cm/info/${encodeURIComponent(ipAddress)}`;
  
  console.log(`[Device] Fetching device info for IP: ${ipAddress}`);
  
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(CM_INFO_TIMEOUT_MS),
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`[Device] API returned ${response.status} for IP ${ipAddress}`);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: `CM Info API returned status ${response.status}`,
        },
      };
    }
    
    const data: CmInfoResponse = await response.json();
    
    // Check if device was found
    // Empty ifPhysAddress or SNMP Timeout error means device not found
    if (!data.ifPhysAddress || data.error === 'SNMP Timeout.') {
      console.log(`[Device] No device found at IP ${ipAddress}: ${data.error || 'Empty MAC'}`);
      return {
        success: false,
        error: {
          code: 'DEVICE_NOT_FOUND',
          message: data.error || 'No device found at this IP address',
        },
      };
    }
    
    const device: DeviceInfo = {
      ipAddress,
      macAddress: data.ifPhysAddress,
      make: extractMakeFromDescription(data.sysDescr),
      model: data.sysName,
      serialNumber: data.docsDevSerialNumber || undefined,
      docsisVersion: formatDocsisVersion(data.docsIfDocsisBaseCapability),
      firmwareVersion: data.docsDevSwCurrentVers || undefined,
      uptime: data.sysUpTime || undefined,
    };
    
    console.log(`[Device] Found device at IP ${ipAddress}: ${device.make} ${device.model} (${device.macAddress})`);
    
    return {
      success: true,
      device,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Device] Error fetching device info for IP ${ipAddress}:`, errorMessage);
    
    // Check for timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out while fetching device information',
        },
      };
    }
    
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: 'Failed to fetch device information',
      },
    };
  }
}
