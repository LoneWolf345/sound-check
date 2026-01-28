import { useNavigate } from 'react-router-dom';
import { Plus, Activity, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/contexts/UserContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useUser();

  // TODO: Replace with real data from Supabase
  const stats = {
    runningJobs: 3,
    completedToday: 12,
    avgPacketLoss: 1.2,
    alertsTriggered: 2,
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {user?.name.split(' ')[0]}
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
            <div className="text-2xl font-bold">{stats.runningJobs}</div>
            <p className="text-xs text-muted-foreground">Currently monitoring</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedToday}</div>
            <p className="text-xs text-muted-foreground">Jobs finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Packet Loss</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgPacketLoss}%</div>
            <p className="text-xs text-muted-foreground">Across all jobs today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alerts Today</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.alertsTriggered}</div>
            <p className="text-xs text-muted-foreground">Offline/recovery alerts</p>
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

      {/* Recent Jobs Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
          <CardDescription>Your most recent monitoring jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No jobs yet. Create your first monitoring job to get started.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/jobs/new')}>
              Create Job
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
