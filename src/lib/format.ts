import { format, formatDistanceToNow, formatDuration, intervalToDuration } from 'date-fns';
import type { DurationUnit, DurationPreset } from '@/types';

export function convertToMinutes(value: number, unit: DurationUnit): number {
  switch (unit) {
    case 'minutes': return value;
    case 'hours': return value * 60;
    case 'days': return value * 1440;
  }
}

export function findBestUnit(minutes: number): DurationPreset {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: minutes / 1440, unit: 'days' };
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return { value: minutes / 60, unit: 'hours' };
  }
  return { value: minutes, unit: 'minutes' };
}

export function formatDurationPreset(preset: DurationPreset): string {
  const { value, unit } = preset;
  if (unit === 'minutes') return `${value} min`;
  if (unit === 'hours') return value === 1 ? '1 hour' : `${value} hours`;
  return value === 1 ? '1 day' : `${value} days`;
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy h:mm a');
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatTime(date: string | Date): string {
  return format(new Date(date), 'h:mm:ss a');
}

export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDurationFromMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} day${days > 1 ? 's' : ''}`;
}

export function formatCadence(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatMs(value: number | null, decimals: number = 1): string {
  if (value === null) return '—';
  return `${value.toFixed(decimals)} ms`;
}

export function formatMacAddress(mac: string): string {
  // Normalize MAC to uppercase with colons
  const cleaned = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (cleaned.length !== 12) return mac;
  return cleaned.match(/.{2}/g)?.join(':') ?? mac;
}

export function isValidMacAddress(mac: string): boolean {
  const cleaned = mac.replace(/[^a-fA-F0-9]/g, '');
  return cleaned.length === 12;
}

export function isValidIpAddress(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  return parts.every(part => part >= 0 && part <= 255);
}

export function formatJobElapsedTime(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const duration = intervalToDuration({ start, end });
  return formatDuration(duration, { format: ['hours', 'minutes', 'seconds'] });
}
