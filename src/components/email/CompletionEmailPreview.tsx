import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { formatMs, formatPercent, formatDurationFromMinutes, formatCadence } from '@/lib/format';
import type { Job, JobSummary, Sample } from '@/types';

interface CompletionEmailPreviewProps {
  job: Job;
  summary: JobSummary;
  samples: Sample[];
  jobDetailUrl?: string;
}

export function CompletionEmailPreview({
  job,
  summary,
  samples,
  jobDetailUrl = '#',
}: CompletionEmailPreviewProps) {
  const systemErrorPercent = summary.totalSamples > 0
    ? (summary.systemErrorCount / summary.totalSamples) * 100
    : 0;
  const showSystemErrorWarning = systemErrorPercent > 5;

  return (
    <div className="bg-background text-foreground font-sans max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-6 rounded-t-lg">
        <h1 className="text-xl font-bold mb-2">Monitoring Job Completed</h1>
        <p className="text-primary-foreground/80 text-sm">
          Account: {job.account_number} • {job.target_mac || job.target_ip}
        </p>
      </div>

      {/* Overall Result */}
      <div className="p-6 border-x">
        <div className="flex items-center justify-center gap-4">
          {summary.overallPass ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div>
                <Badge className="bg-emerald-500 text-white text-lg px-4 py-1">
                  PASS
                </Badge>
                <p className="text-sm text-muted-foreground mt-1">
                  All metrics within acceptable thresholds
                </p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <div>
                <Badge variant="destructive" className="text-lg px-4 py-1">
                  FAIL
                </Badge>
                <p className="text-sm text-muted-foreground mt-1">
                  One or more metrics exceeded thresholds
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* Job Details */}
      <div className="p-6 border-x">
        <h2 className="font-semibold mb-3">Job Configuration</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div className="text-muted-foreground">Duration:</div>
          <div>{formatDurationFromMinutes(job.duration_minutes)}</div>
          <div className="text-muted-foreground">Cadence:</div>
          <div>{formatCadence(job.cadence_seconds)}</div>
          <div className="text-muted-foreground">Reason:</div>
          <div className="capitalize">{job.reason}</div>
          <div className="text-muted-foreground">Started:</div>
          <div>{format(new Date(job.started_at), 'MMM d, yyyy h:mm a')}</div>
          <div className="text-muted-foreground">Completed:</div>
          <div>{job.completed_at ? format(new Date(job.completed_at), 'MMM d, yyyy h:mm a') : '—'}</div>
        </div>
      </div>

      <Separator />

      {/* Metrics Pass/Fail Table */}
      <div className="p-6 border-x">
        <h2 className="font-semibold mb-3">Metric Results</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Metric</th>
                <th className="text-left p-3 font-medium">Value</th>
                <th className="text-left p-3 font-medium">Threshold</th>
                <th className="text-center p-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-3">Packet Loss</td>
                <td className="p-3 font-mono">{formatPercent(summary.packetLossPercent)}</td>
                <td className="p-3 text-muted-foreground">≤ 2%</td>
                <td className="p-3 text-center">
                  <Badge variant={summary.passPacketLoss ? 'default' : 'destructive'}>
                    {summary.passPacketLoss ? 'PASS' : 'FAIL'}
                  </Badge>
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-3">p95 Latency</td>
                <td className="p-3 font-mono">{formatMs(summary.p95RttMs)}</td>
                <td className="p-3 text-muted-foreground">≤ 100 ms</td>
                <td className="p-3 text-center">
                  <Badge variant={summary.passLatency ? 'default' : 'destructive'}>
                    {summary.passLatency ? 'PASS' : 'FAIL'}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Separator />

      {/* RTT Summary */}
      <div className="p-6 border-x">
        <h2 className="font-semibold mb-3">Latency Summary</h2>
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Min RTT</p>
              <p className="text-lg font-mono font-semibold">
                {samples.length > 0
                  ? formatMs(Math.min(...samples.filter(s => s.rtt_ms !== null).map(s => s.rtt_ms!)))
                  : '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Avg RTT</p>
              <p className="text-lg font-mono font-semibold">{formatMs(summary.avgRttMs)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Max RTT</p>
              <p className="text-lg font-mono font-semibold">{formatMs(summary.maxRttMs)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">p95 RTT</p>
              <p className="text-lg font-mono font-semibold">{formatMs(summary.p95RttMs)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Statistics Table */}
      <div className="p-6 border-x">
        <h2 className="font-semibold mb-3">Collection Statistics</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="p-3 text-muted-foreground">Total Samples</td>
                <td className="p-3 font-mono text-right">{summary.totalSamples}</td>
              </tr>
              <tr className="border-t bg-muted/30">
                <td className="p-3 text-muted-foreground">Successful</td>
                <td className="p-3 font-mono text-right">
                  {summary.successCount} ({formatPercent(summary.successRate)})
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-3 text-muted-foreground">Missed</td>
                <td className="p-3 font-mono text-right">{summary.missedCount}</td>
              </tr>
              <tr className="border-t bg-muted/30">
                <td className="p-3 text-muted-foreground">Outage Events (5+ consecutive misses)</td>
                <td className="p-3 font-mono text-right">{summary.outageEventCount}</td>
              </tr>
              <tr className="border-t">
                <td className="p-3 text-muted-foreground">Longest Miss Streak</td>
                <td className="p-3 font-mono text-right">{summary.longestMissStreak} pings</td>
              </tr>
              <tr className="border-t bg-muted/30">
                <td className="p-3 text-muted-foreground">System Errors</td>
                <td className="p-3 font-mono text-right">
                  {summary.systemErrorCount} ({formatPercent(systemErrorPercent)})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* System Error Warning */}
      {showSystemErrorWarning && (
        <>
          <Separator />
          <div className="p-6 border-x">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  High System Error Rate
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  System errors exceeded 5% of total samples ({formatPercent(systemErrorPercent)}).
                  This may indicate issues with the monitoring system rather than the modem.
                  Results should be interpreted with caution.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="p-6 border rounded-b-lg bg-muted/50">
        <div className="flex items-center justify-between text-sm">
          <a
            href={jobDetailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            View Full Job Details <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-muted-foreground">
            Generated: {format(new Date(), 'MMM d, yyyy h:mm a')}
          </span>
        </div>
      </div>
    </div>
  );
}
