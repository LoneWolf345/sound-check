// Sound Check Poller Service Types

export type JobStatus = 'running' | 'completed' | 'cancelled' | 'failed';
export type SampleStatus = 'success' | 'missed' | 'system_error';
export type MonitoringMode = 'simulated' | 'real_polling';

export interface Job {
  id: string;
  account_number: string;
  target_mac: string | null;
  target_ip: string | null;
  duration_minutes: number;
  cadence_seconds: number;
  status: JobStatus;
  monitoring_mode: MonitoringMode;
  started_at: string;
  completed_at: string | null;
  last_ping_at: string | null;
  notification_email: string;
}

export interface Sample {
  job_id: string;
  sequence_number: number;
  status: SampleStatus;
  rtt_ms: number | null;
}

export interface PollerResponse {
  elapsed: number;
  error: string;
  expected: string;
  ip: string;
  poller: string;
}

export interface PollResult {
  status: SampleStatus;
  rtt_ms: number | null;
  poller?: string;
  error?: string;
}

// Device info types for CM Info API
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
}

// Re-export billing types for convenience
export type {
  AccountValidationResult,
  ValidatedAccount,
  BillingApiResponse,
  BillingApiError,
} from './billing.js';
