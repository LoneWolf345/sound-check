import { Clock, Activity, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPercent, formatMs } from '@/lib/format';
import type { JobSummary } from '@/types';

interface MetricTileProps {
  label: string;
  value: string;
  subValue?: string;
  pass?: boolean;
  icon?: React.ElementType;
}

function MetricTile({
  label,
  value,
  subValue,
  pass,
  icon: Icon,
}: MetricTileProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pass !== undefined && (
              <Badge variant={pass ? 'default' : 'destructive'}>
                {pass ? 'PASS' : 'FAIL'}
              </Badge>
            )}
            {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface JobMetricsGridProps {
  summary: JobSummary;
}

export function JobMetricsGrid({ summary }: JobMetricsGridProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Packet Loss"
          value={formatPercent(summary.packetLossPercent)}
          subValue="Threshold: ≤2%"
          pass={summary.passPacketLoss}
        />
        <MetricTile
          label="p95 Latency"
          value={formatMs(summary.p95RttMs)}
          subValue="Threshold: ≤100ms"
          pass={summary.passLatency}
        />
        <MetricTile
          label="Avg RTT"
          value={formatMs(summary.avgRttMs)}
          subValue={`Max: ${formatMs(summary.maxRttMs)}`}
          icon={Clock}
        />
        <MetricTile
          label="Success Rate"
          value={formatPercent(summary.successRate)}
          subValue={`${summary.successCount}/${summary.totalSamples} samples`}
          icon={Activity}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label="Outage Events"
          value={summary.outageEventCount.toString()}
          subValue="5+ consecutive misses"
          icon={AlertTriangle}
        />
        <MetricTile
          label="Longest Miss Streak"
          value={`${summary.longestMissStreak} pings`}
          icon={XCircle}
        />
        <MetricTile
          label="System Errors"
          value={summary.systemErrorCount.toString()}
          subValue={formatPercent((summary.systemErrorCount / summary.totalSamples) * 100)}
          icon={AlertTriangle}
        />
      </div>
    </>
  );
}
