import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, XCircle, CheckCircle2, AlertTriangle, Clock, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatDateTime, formatDurationFromMinutes, formatCadence, formatPercent, formatMs } from '@/lib/format';
import { calculateJobSummary } from '@/lib/calculations';
import { generateMockSamples } from '@/lib/mock-data';
import type { Job, Sample, JobSummary } from '@/types';

// Mock job for development
const MOCK_JOB: Job = {
  id: 'job-1',
  account_number: '123456789',
  target_mac: '00:1A:2B:3C:4D:5E',
  target_ip: '10.20.30.40',
  duration_minutes: 60,
  cadence_seconds: 60,
  reason: 'reactive',
  notification_email: 'john.smith@company.com',
  alert_on_offline: true,
  alert_on_recovery: true,
  status: 'completed',
  alert_state: 'ok',
  requester_id: 'user-1',
  requester_name: 'John Smith',
  source: 'web_app',
  started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  completed_at: new Date().toISOString(),
  cancelled_at: null,
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};

function MetricTile({
  label,
  value,
  subValue,
  pass,
  icon: Icon,
}: {
  label: string;
  value: string;
  subValue?: string;
  pass?: boolean;
  icon?: React.ElementType;
}) {
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

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Mock data - will be replaced with real data fetching
  const job = MOCK_JOB;
  const samples = generateMockSamples(job.id, 60, 'intermittent', new Date(job.started_at));
  const summary = calculateJobSummary(samples);

  // Prepare chart data
  const chartData = samples.map((sample, index) => ({
    time: new Date(sample.recorded_at).toLocaleTimeString(),
    rtt: sample.status === 'success' ? sample.rtt_ms : null,
    missed: sample.status === 'missed' ? 1 : 0,
    index,
  }));

  const progress = job.status === 'running'
    ? Math.min(100, (Date.now() - new Date(job.started_at).getTime()) / (job.duration_minutes * 60 * 1000) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/jobs')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Job Details</h1>
              <Badge
                variant={
                  job.status === 'running'
                    ? 'default'
                    : job.status === 'completed'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {job.status}
              </Badge>
              {job.status === 'completed' && (
                <Badge variant={summary.overallPass ? 'default' : 'destructive'}>
                  {summary.overallPass ? 'PASS' : 'FAIL'}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Account: {job.account_number} • {job.target_mac || job.target_ip}
            </p>
          </div>
        </div>
        {job.status === 'running' && (
          <Button variant="destructive" className="gap-2">
            <XCircle className="h-4 w-4" />
            Cancel Job
          </Button>
        )}
      </div>

      {/* Progress (for running jobs) */}
      {job.status === 'running' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Started {formatDateTime(job.started_at)} • {formatDurationFromMinutes(job.duration_minutes)} duration
            </p>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
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

      {/* RTT Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Latency Over Time</CardTitle>
          <CardDescription>
            RTT (ms) for each ping attempt. Gaps indicate missed pings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="index"
                  tickFormatter={(i) => `#${i + 1}`}
                  className="text-xs"
                />
                <YAxis
                  domain={[0, 'auto']}
                  tickFormatter={(v) => `${v}ms`}
                  className="text-xs"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <p className="text-xs text-muted-foreground">{data.time}</p>
                          <p className="font-medium">
                            {data.rtt !== null ? `${data.rtt.toFixed(1)} ms` : 'Missed'}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={100} stroke="hsl(var(--destructive))" strokeDasharray="5 5" />
                <Line
                  type="monotone"
                  dataKey="rtt"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Job Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Job Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Account Number</dt>
              <dd className="text-sm">{job.account_number}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">MAC Address</dt>
              <dd className="text-sm font-mono">{job.target_mac || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Management IP</dt>
              <dd className="text-sm font-mono">{job.target_ip || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Duration</dt>
              <dd className="text-sm">{formatDurationFromMinutes(job.duration_minutes)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Cadence</dt>
              <dd className="text-sm">{formatCadence(job.cadence_seconds)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Reason</dt>
              <dd className="text-sm capitalize">{job.reason}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Requester</dt>
              <dd className="text-sm">{job.requester_name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Notification Email</dt>
              <dd className="text-sm">{job.notification_email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Source</dt>
              <dd className="text-sm">{job.source === 'tempo' ? 'TeMPO API' : 'Web App'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Started</dt>
              <dd className="text-sm">{formatDateTime(job.started_at)}</dd>
            </div>
            {job.completed_at && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Completed</dt>
                <dd className="text-sm">{formatDateTime(job.completed_at)}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Alerts</dt>
              <dd className="text-sm">
                {job.alert_on_offline && 'Offline'}{job.alert_on_offline && job.alert_on_recovery && ', '}{job.alert_on_recovery && 'Recovery'}
                {!job.alert_on_offline && !job.alert_on_recovery && 'None'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
