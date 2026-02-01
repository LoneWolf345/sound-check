import type { Sample, SampleStatus, Job } from '@/types';

export type MockScenario = 'healthy' | 'intermittent' | 'offline' | 'recovering';

interface MockScenarioConfig {
  successRate: number;
  avgRtt: number;
  rttVariance: number;
  burstMissChance: number;
  burstLength: number;
}

const SCENARIO_CONFIGS: Record<MockScenario, MockScenarioConfig> = {
  healthy: {
    successRate: 0.99,
    avgRtt: 25,
    rttVariance: 10,
    burstMissChance: 0.01,
    burstLength: 2,
  },
  intermittent: {
    successRate: 0.92,
    avgRtt: 45,
    rttVariance: 30,
    burstMissChance: 0.15,
    burstLength: 5,
  },
  offline: {
    successRate: 0.1,
    avgRtt: 80,
    rttVariance: 50,
    burstMissChance: 0.7,
    burstLength: 20,
  },
  recovering: {
    successRate: 0.85,
    avgRtt: 55,
    rttVariance: 25,
    burstMissChance: 0.1,
    burstLength: 3,
  },
};

function randomGaussian(mean: number, variance: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * Math.sqrt(variance);
}

export function generateMockSamples(
  jobId: string,
  totalSamples: number,
  scenario: MockScenario = 'healthy',
  startTime: Date = new Date()
): Sample[] {
  const config = SCENARIO_CONFIGS[scenario];
  const samples: Sample[] = [];
  let inBurst = false;
  let burstRemaining = 0;
  let previousRtt: number | null = null;

  for (let i = 0; i < totalSamples; i++) {
    let status: SampleStatus;
    let rtt: number | null = null;
    let jitter: number | null = null;

    // Handle burst misses
    if (inBurst && burstRemaining > 0) {
      status = 'missed';
      burstRemaining--;
      if (burstRemaining === 0) inBurst = false;
    } else if (Math.random() < config.burstMissChance) {
      // Start a new burst
      inBurst = true;
      burstRemaining = Math.floor(Math.random() * config.burstLength) + 1;
      status = 'missed';
      burstRemaining--;
      if (burstRemaining === 0) inBurst = false;
    } else if (Math.random() < config.successRate) {
      status = 'success';
      rtt = Math.max(1, randomGaussian(config.avgRtt, config.rttVariance));
      // Calculate jitter as absolute difference from previous RTT (RFC 3550 IPDV)
      if (previousRtt !== null) {
        jitter = Math.abs(rtt - previousRtt);
      }
      previousRtt = rtt;
    } else if (Math.random() < 0.95) {
      status = 'missed';
    } else {
      status = 'system_error';
    }

    const recordedAt = new Date(startTime.getTime() + i * 10000); // 10 sec intervals

    samples.push({
      id: `sample-${jobId}-${i}`,
      job_id: jobId,
      status,
      rtt_ms: rtt ? Math.round(rtt * 100) / 100 : null,
      jitter_ms: jitter ? Math.round(jitter * 100) / 100 : null,
      recorded_at: recordedAt.toISOString(),
      sequence_number: i + 1,
    });
  }

  return samples;
}

export function generateMockJob(
  userId: string,
  userName: string,
  overrides: Partial<Job> = {}
): Job {
  const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  return {
    id,
    account_number: `${Math.floor(Math.random() * 900000000) + 100000000}`,
    target_mac: `00:1A:2B:${Math.random().toString(16).substr(2, 2).toUpperCase()}:${Math.random().toString(16).substr(2, 2).toUpperCase()}:${Math.random().toString(16).substr(2, 2).toUpperCase()}`,
    target_ip: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    duration_minutes: 60,
    cadence_seconds: 60,
    reason: Math.random() > 0.5 ? 'reactive' : 'proactive',
    notification_email: `${userName.toLowerCase().replace(' ', '.')}@company.com`,
    alert_on_offline: true,
    alert_on_recovery: true,
    status: 'running',
    alert_state: 'ok',
    requester_id: userId,
    requester_name: userName,
    source: 'web_app',
    monitoring_mode: 'simulated',
    started_at: now.toISOString(),
    completed_at: null,
    cancelled_at: null,
    last_ping_at: null,
    created_at: now.toISOString(),
    avg_rtt_ms: null,
    packet_loss_percent: null,
    total_samples: 0,
    ...overrides,
  };
}

// Mock billing API response
export interface MockBillingAccount {
  accountNumber: string;
  customerName: string;
  serviceAddress: string;
  modems: Array<{
    macAddress: string;
    managementIp: string;
    model: string;
    status: 'online' | 'offline';
  }>;
}

export function mockValidateAccount(accountNumber: string): Promise<MockBillingAccount | null> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate validation - accounts starting with 1, 2, 3 are valid
      if (/^[123]\d{8}$/.test(accountNumber)) {
        resolve({
          accountNumber,
          customerName: 'John Customer',
          serviceAddress: '123 Main St, Anytown, ST 12345',
          modems: [
            {
              macAddress: '00:1A:2B:3C:4D:5E',
              managementIp: '10.20.30.40',
              model: 'ARRIS TG3452',
              status: 'online',
            },
          ],
        });
      } else {
        resolve(null);
      }
    }, 500); // Simulate network delay
  });
}
