import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Activity, Clock, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthContext } from '@/contexts/AuthContext';
import { useJobStats, useRecentJobs } from '@/hooks/use-jobs';
import { formatDateTime, formatDurationFromMinutes } from '@/lib/format';
import { checkAndCompleteExpiredJobs } from '@/lib/ping-simulator';
import { useQueryClient } from '@tanstack/react-query';
import type { JobStatus } from '@/types';

function getStatusBadgeVariant(status: JobStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'running':
      return 'default';
    case 'completed':
      return 'secondary';
    case 'cancelled':
      return 'outline';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useAuthContext();
  const queryClient = useQueryClient();
  const hasCheckedExpiredJobs = useRef(false);

  const { data: stats, isLoading: statsLoading } = useJobStats();
  const { data: recentJobs, isLoading: recentJobsLoading } = useRecentJobs(profile?.id);

  // Check and complete any expired jobs on dashboard load
  useEffect(() => {
    if (hasCheckedExpiredJobs.current) return;
    hasCheckedExpiredJobs.current = true;

    checkAndCompleteExpiredJobs().then(({ completed, resumed }) => {
      if (completed.length > 0 || resumed.length > 0) {
        console.log(`Dashboard cleanup: ${completed.length} jobs completed, ${resumed.length} jobs resumed`);
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['job-stats'] });
        queryClient.invalidateQueries({ queryKey: ['recent-jobs'] });
      }
    });
  }, [queryClient]);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-muted-foreground">
            Monitor modem connectivity and track issues in real-time.
          </p>
        </div>
        <Button onClick={() => navigate('/jobs/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          New Monitoring Job
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running Jobs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.runningJobs ?? 0}</div>
                <p className="text-xs text-muted-foreground">Currently monitoring</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.completedToday ?? 0}</div>
                <p className="text-xs text-muted-foreground">Jobs finished</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Packet Loss</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.avgPacketLoss?.toFixed(1) ?? '0'}%</div>
                <p className="text-xs text-muted-foreground">Across all jobs today</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alerts Today</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.alertsTriggered ?? 0}</div>
                <p className="text-xs text-muted-foreground">Offline/recovery alerts</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate('/jobs/new')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Start New Job
            </CardTitle>
            <CardDescription>
              Create a new monitoring job to track modem connectivity
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate('/jobs')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              View All Jobs
            </CardTitle>
            <CardDescription>
              See running, completed, and cancelled jobs
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
          <CardDescription>Your most recent monitoring jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {recentJobsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !recentJobs || recentJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No jobs yet. Create your first monitoring job to get started.</p>
              <Button variant="outline" className="mt-4" onClick={() => navigate('/jobs/new')}>
                Create Job
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{job.account_number}</span>
                      <Badge variant={getStatusBadgeVariant(job.status)} className="text-xs">
                        {job.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {job.target_mac || job.target_ip} • {formatDurationFromMinutes(job.duration_minutes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {formatDateTime(job.created_at)}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
