import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, XCircle, Clock, Activity, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { useJob, useJobSamples, useCancelJob } from '@/hooks/use-jobs';
import { createAuditLogEntry } from '@/hooks/use-audit-log';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';
import { stopSimulator } from '@/lib/ping-simulator';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { Sample } from '@/types';

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

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUser();
  const queryClient = useQueryClient();

  const { data: job, isLoading: jobLoading, error: jobError } = useJob(id);
  const { data: samples = [] } = useJobSamples(id);
  const cancelJobMutation = useCancelJob();

  // Subscribe to real-time sample updates
  useEffect(() => {
    if (!id || job?.status !== 'running') return;

    const channel = supabase
      .channel(`samples:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'samples',
          filter: `job_id=eq.${id}`,
        },
        () => {
          // Refetch samples when new ones arrive
          queryClient.invalidateQueries({ queryKey: ['samples', id] });
        }
      )
      .subscribe();

    // Also subscribe to job updates
    const jobChannel = supabase
      .channel(`job:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['job', id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(jobChannel);
    };
  }, [id, job?.status, queryClient]);

  const summary = samples.length > 0 ? calculateJobSummary(samples) : null;

  // Prepare chart data
  const chartData = samples.map((sample, index) => ({
    time: new Date(sample.recorded_at).toLocaleTimeString(),
    rtt: sample.status === 'success' ? sample.rtt_ms : null,
    missed: sample.status === 'missed' ? 1 : 0,
    index,
  }));

  const progress = job?.status === 'running'
    ? Math.min(100, (Date.now() - new Date(job.started_at).getTime()) / (job.duration_minutes * 60 * 1000) * 100)
    : 100;

  async function handleCancelJob() {
    if (!job || !user) return;

    try {
      stopSimulator(job.id);
      await cancelJobMutation.mutateAsync(job.id);

      await createAuditLogEntry({
        action: 'job.cancel',
        entityType: 'job',
        entityId: job.id,
        actorId: user.id,
        actorName: user.name,
        details: {
          account_number: job.account_number,
          cancelled_after_minutes: Math.round(
            (Date.now() - new Date(job.started_at).getTime()) / 60000
          ),
        },
      });

      toast({
        title: 'Job Cancelled',
        description: 'The monitoring job has been cancelled.',
      });
    } catch (error) {
      console.error('Failed to cancel job:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel job. Please try again.',
        variant: 'destructive',
      });
    }
  }

  if (jobLoading) {
    return <LoadingSkeleton />;
  }

  if (jobError || !job) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/jobs')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Job Not Found</h1>
            <p className="text-muted-foreground">
              The requested job could not be found.
            </p>
          </div>
        </div>
        <Button onClick={() => navigate('/jobs')}>Back to Jobs</Button>
      </div>
    );
  }

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
              {job.status === 'completed' && summary && (
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <XCircle className="h-4 w-4" />
                Cancel Job
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Monitoring Job?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will stop monitoring for account {job.account_number}.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Running</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancelJob}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Cancel Job
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
              {samples.length > 0 && ` • ${samples.length} samples collected`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      {summary ? (
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
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Waiting for samples...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* RTT Chart */}
      {chartData.length > 0 && (
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
                              {data.rtt !== null ? `${Number(data.rtt).toFixed(1)} ms` : 'Missed'}
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
      )}

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
            {job.cancelled_at && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Cancelled</dt>
                <dd className="text-sm">{formatDateTime(job.cancelled_at)}</dd>
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
