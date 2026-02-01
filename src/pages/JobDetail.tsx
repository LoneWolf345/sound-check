import { useEffect, useRef, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, XCircle, Loader2, Mail, Copy, AlertTriangle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { formatDateTime, formatDurationFromMinutes, formatCadence } from '@/lib/format';
import { calculateJobSummary } from '@/lib/calculations';
import { useJob, useJobSamples, useCancelJob } from '@/hooks/use-jobs';
import { useJobAlerts } from '@/hooks/use-alerts';
import { createAuditLogEntry } from '@/hooks/use-audit-log';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { stopSimulator, checkAndHandleJob, forceStartSimulator, isSimulatorRunning } from '@/lib/ping-simulator';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useQueryClient } from '@tanstack/react-query';

// Extracted components
import { RTTChart } from '@/components/charts/RTTChart';
import { AvailabilityTimeline } from '@/components/charts/AvailabilityTimeline';
import { JobMetricsGrid } from '@/components/job/JobMetricsGrid';
import { JobEventLog } from '@/components/job/JobEventLog';
import { CompletionEmailPreview } from '@/components/email/CompletionEmailPreview';

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
  const { user, profile } = useAuthContext();
  const queryClient = useQueryClient();
  const hasCheckedJob = useRef(false);

  const { data: job, isLoading: jobLoading, error: jobError } = useJob(id);
  const { data: samples = [] } = useJobSamples(id);
  const { data: alerts = [] } = useJobAlerts(id);
  const cancelJobMutation = useCancelJob();
  const [usingFallbackSimulator, setUsingFallbackSimulator] = useState(false);

  // Detect if real_polling job appears stuck (no samples after 2x cadence)
  const isPollerStale = useMemo(() => {
    if (!job || job.status !== 'running') return false;
    if (job.monitoring_mode !== 'real_polling') return false;
    if (samples.length > 0) return false;
    if (usingFallbackSimulator) return false;
    if (isSimulatorRunning(job.id)) return false;
    
    const staleDuration = job.cadence_seconds * 2 * 1000; // 2x cadence
    const timeSinceStart = Date.now() - new Date(job.started_at).getTime();
    return timeSinceStart > staleDuration;
  }, [job, samples, usingFallbackSimulator]);

  async function handleStartFallbackSimulator() {
    if (!job) return;
    
    const started = await forceStartSimulator(
      job.id,
      job.cadence_seconds,
      job.duration_minutes,
      job.started_at
    );
    
    if (started) {
      setUsingFallbackSimulator(true);
      toast({
        title: 'Fallback Simulator Started',
        description: 'Using browser-based simulated data since the external poller is unavailable.',
      });
    } else {
      toast({
        title: 'Could Not Start Simulator',
        description: 'The simulator may already be running or the job has expired.',
        variant: 'destructive',
      });
    }
  }

  // Check and handle job state on load (auto-complete if expired, resume if still running)
  useEffect(() => {
    if (!id || !job || hasCheckedJob.current) return;
    if (job.status !== 'running') return;

    hasCheckedJob.current = true;
    
    checkAndHandleJob(id).then((result) => {
      if (result === 'completed') {
        toast({
          title: 'Job Auto-Completed',
          description: 'This job has been automatically completed as it exceeded its scheduled duration.',
        });
        queryClient.invalidateQueries({ queryKey: ['job', id] });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['job-stats'] });
      } else if (result === 'resumed') {
        toast({
          title: 'Simulator Resumed',
          description: 'Sample collection has been resumed for this job.',
        });
      }
    });
  }, [id, job, queryClient, toast]);

  // Subscribe to real-time updates for samples, job, and alerts
  useEffect(() => {
    if (!id) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Always subscribe to job updates (status changes, completion, etc.)
    const jobChannel = supabase
      .channel(`job:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['job', id] });
        }
      )
      .subscribe();
    channels.push(jobChannel);

    // Subscribe to sample updates for running jobs
    if (job?.status === 'running') {
      const samplesChannel = supabase
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
            queryClient.invalidateQueries({ queryKey: ['samples', id], exact: false });
          }
        )
        .subscribe();
      channels.push(samplesChannel);
    }

    // Subscribe to alert updates
    const alertsChannel = supabase
      .channel(`alerts:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
          filter: `job_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['alerts', id] });
        }
      )
      .subscribe();
    channels.push(alertsChannel);

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [id, job?.status, queryClient]);

  const summary = samples.length > 0 ? calculateJobSummary(samples) : null;

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
        actorId: user!.id,
        actorName: profile?.display_name || user!.email || 'Unknown',
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

  function handleCopyEmailContent() {
    // Copy a text summary to clipboard
    if (!job || !summary) return;
    
    const text = `
Monitoring Job Completed
========================
Account: ${job.account_number}
Target: ${job.target_mac || job.target_ip}
Result: ${summary.overallPass ? 'PASS' : 'FAIL'}

Packet Loss: ${summary.packetLossPercent.toFixed(2)}% (${summary.passPacketLoss ? 'PASS' : 'FAIL'})
p95 Latency: ${summary.p95RttMs?.toFixed(1) ?? '—'} ms (${summary.passLatency ? 'PASS' : 'FAIL'})

Statistics:
- Total Samples: ${summary.totalSamples}
- Success Rate: ${summary.successRate.toFixed(1)}%
- Outage Events: ${summary.outageEventCount}
- Longest Miss Streak: ${summary.longestMissStreak}
- System Errors: ${summary.systemErrorCount}

View full details: ${window.location.href}
    `.trim();

    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Email content copied to clipboard.',
    });
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
        <div className="flex items-center gap-2">
          {/* Email Preview for completed jobs */}
          {job.status === 'completed' && summary && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Email Preview
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle>Completion Email Preview</DialogTitle>
                  <DialogDescription>
                    Preview of the email that would be sent to {job.notification_email}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleCopyEmailContent}
                  >
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                  </Button>
                </div>
                <ScrollArea className="max-h-[60vh]">
                  <CompletionEmailPreview
                    job={job}
                    summary={summary}
                    samples={samples}
                    jobDetailUrl={window.location.href}
                  />
                </ScrollArea>
              </DialogContent>
            </Dialog>
          )}

          {/* Cancel button for running jobs */}
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
      </div>

      {/* Poller Stale Warning */}
      {isPollerStale && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Samples Detected</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              This job uses real polling mode but no samples have been received.
              The external poller service may not be running or may have lost connectivity.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="w-fit gap-2"
              onClick={handleStartFallbackSimulator}
            >
              <Play className="h-4 w-4" />
              Use Simulated Data Instead
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Fallback Simulator Active Notice */}
      {usingFallbackSimulator && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Using Simulated Data</AlertTitle>
          <AlertDescription>
            The browser-based simulator is generating sample data because the external poller is unavailable.
            This data is for testing purposes only.
          </AlertDescription>
        </Alert>
      )}

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
        <JobMetricsGrid summary={summary} />
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
      {samples.length > 0 && <RTTChart samples={samples} />}

      {/* Availability Timeline */}
      {samples.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Availability Timeline</CardTitle>
            <CardDescription>
              Color-coded visualization of each sample. Hover for details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AvailabilityTimeline
              samples={samples}
              startTime={new Date(job.started_at)}
              endTime={job.completed_at ? new Date(job.completed_at) : undefined}
            />
          </CardContent>
        </Card>
      )}

      {/* Event Log & Job Configuration side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Event Log */}
        <Card>
          <CardHeader>
            <CardTitle>Event Log</CardTitle>
            <CardDescription>
              Job lifecycle and alert history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobEventLog job={job} alerts={alerts} />
          </CardContent>
        </Card>

        {/* Job Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Job Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="font-medium text-muted-foreground">Account Number</dt>
                <dd>{job.account_number}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">MAC Address</dt>
                <dd className="font-mono">{job.target_mac || '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Management IP</dt>
                <dd className="font-mono">{job.target_ip || '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Duration</dt>
                <dd>{formatDurationFromMinutes(job.duration_minutes)}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Cadence</dt>
                <dd>{formatCadence(job.cadence_seconds)}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Reason</dt>
                <dd className="capitalize">{job.reason}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Requester</dt>
                <dd>{job.requester_name}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Notification Email</dt>
                <dd>{job.notification_email}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Source</dt>
                <dd>{job.source === 'tempo' ? 'TeMPO API' : 'Web App'}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Monitoring Mode</dt>
                <dd className="capitalize">{job.monitoring_mode === 'real_polling' ? 'Real Polling' : 'Simulated'}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Last Ping</dt>
                <dd>{job.last_ping_at ? formatDateTime(job.last_ping_at) : 'Never'}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Alerts</dt>
                <dd>
                  {job.alert_on_offline && 'Offline'}{job.alert_on_offline && job.alert_on_recovery && ', '}{job.alert_on_recovery && 'Recovery'}
                  {!job.alert_on_offline && !job.alert_on_recovery && 'None'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Started</dt>
                <dd>{formatDateTime(job.started_at)}</dd>
              </div>
              {job.completed_at && (
                <div>
                  <dt className="font-medium text-muted-foreground">Completed</dt>
                  <dd>{formatDateTime(job.completed_at)}</dd>
                </div>
              )}
              {job.cancelled_at && (
                <div>
                  <dt className="font-medium text-muted-foreground">Cancelled</dt>
                  <dd>{formatDateTime(job.cancelled_at)}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
