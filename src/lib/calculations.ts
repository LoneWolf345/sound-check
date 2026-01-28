import type { Sample, JobSummary, ThresholdsConfig } from '@/types';

const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  packet_loss_percent: 2,
  p95_latency_ms: 100,
  system_error_percent: 5,
};

export function calculateJobSummary(
  samples: Sample[],
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS
): JobSummary {
  const totalSamples = samples.length;
  
  if (totalSamples === 0) {
    return {
      totalSamples: 0,
      successCount: 0,
      missedCount: 0,
      systemErrorCount: 0,
      packetLossPercent: 0,
      avgRttMs: null,
      maxRttMs: null,
      p95RttMs: null,
      successRate: 0,
      outageEventCount: 0,
      longestMissStreak: 0,
      passPacketLoss: true,
      passLatency: true,
      overallPass: true,
    };
  }

  const successCount = samples.filter(s => s.status === 'success').length;
  const missedCount = samples.filter(s => s.status === 'missed').length;
  const systemErrorCount = samples.filter(s => s.status === 'system_error').length;

  // Exclude system errors from packet loss calculation
  const validAttempts = successCount + missedCount;
  const packetLossPercent = validAttempts > 0 
    ? (missedCount / validAttempts) * 100 
    : 0;

  // RTT calculations from successful samples only
  const rttValues = samples
    .filter(s => s.status === 'success' && s.rtt_ms !== null)
    .map(s => s.rtt_ms as number)
    .sort((a, b) => a - b);

  const avgRttMs = rttValues.length > 0
    ? rttValues.reduce((sum, v) => sum + v, 0) / rttValues.length
    : null;

  const maxRttMs = rttValues.length > 0
    ? Math.max(...rttValues)
    : null;

  // P95 calculation
  const p95RttMs = rttValues.length > 0
    ? rttValues[Math.floor(rttValues.length * 0.95)] ?? rttValues[rttValues.length - 1]
    : null;

  const successRate = totalSamples > 0
    ? (successCount / totalSamples) * 100
    : 0;

  // Calculate outage events and longest miss streak
  const { outageEventCount, longestMissStreak } = calculateOutageMetrics(samples);

  // Pass/fail evaluation
  const passPacketLoss = packetLossPercent <= thresholds.packet_loss_percent;
  const passLatency = p95RttMs === null || p95RttMs <= thresholds.p95_latency_ms;
  const overallPass = passPacketLoss && passLatency;

  return {
    totalSamples,
    successCount,
    missedCount,
    systemErrorCount,
    packetLossPercent,
    avgRttMs,
    maxRttMs,
    p95RttMs,
    successRate,
    outageEventCount,
    longestMissStreak,
    passPacketLoss,
    passLatency,
    overallPass,
  };
}

function calculateOutageMetrics(samples: Sample[]): { outageEventCount: number; longestMissStreak: number } {
  if (samples.length === 0) {
    return { outageEventCount: 0, longestMissStreak: 0 };
  }

  // Sort by sequence number
  const sorted = [...samples].sort((a, b) => a.sequence_number - b.sequence_number);

  let outageEventCount = 0;
  let longestMissStreak = 0;
  let currentMissStreak = 0;
  let wasInOutage = false;

  for (const sample of sorted) {
    if (sample.status === 'missed') {
      currentMissStreak++;
      if (!wasInOutage && currentMissStreak >= 5) {
        outageEventCount++;
        wasInOutage = true;
      }
      longestMissStreak = Math.max(longestMissStreak, currentMissStreak);
    } else if (sample.status === 'success') {
      currentMissStreak = 0;
      wasInOutage = false;
    }
    // System errors don't reset streaks
  }

  return { outageEventCount, longestMissStreak };
}

export function shouldTriggerOfflineAlert(samples: Sample[], currentAlertState: 'ok' | 'offline_alerted'): boolean {
  if (currentAlertState === 'offline_alerted') return false;
  
  const sorted = [...samples].sort((a, b) => a.sequence_number - b.sequence_number);
  const lastFive = sorted.slice(-5);
  
  if (lastFive.length < 5) return false;
  
  return lastFive.every(s => s.status === 'missed');
}

export function shouldTriggerRecoveryAlert(samples: Sample[], currentAlertState: 'ok' | 'offline_alerted'): boolean {
  if (currentAlertState !== 'offline_alerted') return false;
  
  const sorted = [...samples].sort((a, b) => a.sequence_number - b.sequence_number);
  const lastFive = sorted.slice(-5);
  
  if (lastFive.length < 5) return false;
  
  return lastFive.every(s => s.status === 'success');
}
