// Job and monitoring types for the Modem Monitoring Tool

export type JobStatus = 'running' | 'completed' | 'cancelled' | 'failed';
export type SampleStatus = 'success' | 'missed' | 'system_error';
export type JobReason = 'reactive' | 'proactive';
export type AlertState = 'ok' | 'offline_alerted';
export type AppRole = 'admin' | 'user';

export interface Job {
  id: string;
  account_number: string;
  target_mac: string | null;
  target_ip: string | null;
  duration_minutes: number;
  cadence_seconds: number;
  reason: JobReason;
  notification_email: string;
  alert_on_offline: boolean;
  alert_on_recovery: boolean;
  status: JobStatus;
  alert_state: AlertState;
  requester_id: string;
  requester_name: string;
  source: string;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface Sample {
  id: string;
  job_id: string;
  status: SampleStatus;
  rtt_ms: number | null;
  recorded_at: string;
  sequence_number: number;
}

export interface Alert {
  id: string;
  job_id: string;
  alert_type: string;
  triggered_at: string;
  delivered_at: string | null;
  delivery_status: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminConfig {
  id: string;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

// Config value types
export type DurationUnit = 'minutes' | 'hours' | 'days';

export interface DurationPreset {
  value: number;
  unit: DurationUnit;
}

export interface DurationPresetsConfig {
  presets: DurationPreset[];
  default: number; // in minutes for backward compatibility
}

export interface CadencePresetsConfig {
  presets: number[]; // in seconds
  default: number;
}

export interface ThresholdsConfig {
  packet_loss_percent: number;
  p95_latency_ms: number;
  system_error_percent: number;
}

export interface UsageLimitsConfig {
  jobs_per_user_per_day: number;
  max_running_jobs: number;
}

export interface WebhookConfig {
  endpoint: string | null;
  secret: string | null;
}

// Job summary statistics
export interface JobSummary {
  totalSamples: number;
  successCount: number;
  missedCount: number;
  systemErrorCount: number;
  packetLossPercent: number;
  avgRttMs: number | null;
  maxRttMs: number | null;
  p95RttMs: number | null;
  successRate: number;
  outageEventCount: number;
  longestMissStreak: number;
  passPacketLoss: boolean;
  passLatency: boolean;
  overallPass: boolean;
}

// Mock user for SSO bypass
export interface MockUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}
