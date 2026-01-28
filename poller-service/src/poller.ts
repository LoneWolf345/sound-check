import type { PollResult, PollerResponse } from './types.js';

const POLLER_BASE_URL = process.env.POLLER_BASE_URL || 'http://phoenix.polling.corp.cableone.net:4402';
const POLL_TIMEOUT_MS = parseInt(process.env.POLL_TIMEOUT_MS || '10000', 10);

/**
 * Call the SpreeDB polling API to measure latency to a target IP
 */
export async function pollLatency(targetIp: string): Promise<PollResult> {
  const url = `${POLLER_BASE_URL}/latency/Sound%20Check/${targetIp}/`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`Poller API returned status ${response.status} for IP ${targetIp}`);
      return { status: 'system_error', rtt_ms: null, error: `HTTP ${response.status}` };
    }
    
    const data: PollerResponse = await response.json();
    
    // Check for errors in the response
    if (data.error) {
      const errorLower = data.error.toLowerCase();
      
      // Timeout or unreachable errors are "missed" pings
      if (
        errorLower.includes('timeout') ||
        errorLower.includes('unreachable') ||
        errorLower.includes('no reply') ||
        errorLower.includes('host down')
      ) {
        return { 
          status: 'missed', 
          rtt_ms: null, 
          poller: data.poller,
          error: data.error,
        };
      }
      
      // Other errors are system errors
      return { 
        status: 'system_error', 
        rtt_ms: null, 
        poller: data.poller,
        error: data.error,
      };
    }
    
    // Successful ping with RTT
    if (data.elapsed > 0) {
      return { 
        status: 'success', 
        rtt_ms: data.elapsed,
        poller: data.poller,
      };
    }
    
    // Zero or negative elapsed time without error - treat as missed
    return { 
      status: 'missed', 
      rtt_ms: null,
      poller: data.poller,
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error(`Poller request timed out for IP ${targetIp}`);
        return { status: 'system_error', rtt_ms: null, error: 'Request timeout' };
      }
      console.error(`Poller request failed for IP ${targetIp}:`, error.message);
      return { status: 'system_error', rtt_ms: null, error: error.message };
    }
    
    console.error(`Poller request failed for IP ${targetIp}:`, error);
    return { status: 'system_error', rtt_ms: null, error: 'Unknown error' };
  }
}
