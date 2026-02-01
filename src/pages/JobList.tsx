import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Eye, XCircle, Activity, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { formatDateTime, formatDurationFromMinutes } from '@/lib/format';
import { useJobs, useCancelJob } from '@/hooks/use-jobs';
import { createAuditLogEntry } from '@/hooks/use-audit-log';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { stopSimulator } from '@/lib/ping-simulator';
import type { Job, JobStatus } from '@/types';

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

export default function JobList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuthContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: jobsResult, isLoading, error } = useJobs({
    status: statusFilter,
    search: searchQuery || undefined,
    page,
    pageSize,
  });

  const jobs = jobsResult?.data ?? [];
  const totalJobs = jobsResult?.total ?? 0;
  const totalPages = jobsResult?.totalPages ?? 1;

  const cancelJobMutation = useCancelJob();

  async function handleCancelJob(job: Job) {
    if (!user) return;

    setCancellingJobId(job.id);
    try {
      // Stop the simulator if running
      stopSimulator(job.id);

      // Cancel the job in database
      await cancelJobMutation.mutateAsync(job.id);

      // Create audit log entry
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
    } finally {
      setCancellingJobId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Monitoring Jobs</h1>
        <p className="text-muted-foreground">
          View and manage all monitoring jobs.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by account, MAC, IP, or job ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as JobStatus | 'all')}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
          <CardDescription>
            {isLoading ? 'Loading...' : `${totalJobs} job${totalJobs !== 1 ? 's' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Failed to load jobs. Please try again.</p>
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No jobs found matching your criteria.</p>
            </div>
          ) : (
            <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Target IP</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Avg RTT</TableHead>
                  <TableHead className="text-right">Packet Loss</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.account_number}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {job.target_ip || '—'}
                    </TableCell>
                    <TableCell>{formatDurationFromMinutes(job.duration_minutes)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(job.status)}>
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {job.avg_rtt_ms !== null ? `${Number(job.avg_rtt_ms).toFixed(1)} ms` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {job.packet_loss_percent !== null 
                        ? <span className={Number(job.packet_loss_percent) > 2 ? 'text-destructive' : ''}>
                            {Number(job.packet_loss_percent).toFixed(1)}%
                          </span>
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(job.started_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/jobs/${job.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {job.status === 'running' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={cancellingJobId === job.id}
                              >
                                {cancellingJobId === job.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <XCircle className="h-4 w-4" />
                                )}
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
                                  onClick={() => handleCancelJob(job)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Cancel Job
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalJobs)} of {totalJobs} jobs
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
