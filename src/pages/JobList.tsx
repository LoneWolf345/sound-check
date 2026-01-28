import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Eye, XCircle, Activity } from 'lucide-react';
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
import { formatDateTime, formatDurationFromMinutes, formatCadence } from '@/lib/format';
import type { Job, JobStatus } from '@/types';

// Mock data for development
const MOCK_JOBS: Job[] = [
  {
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
    status: 'running',
    alert_state: 'ok',
    requester_id: 'user-1',
    requester_name: 'John Smith',
    source: 'web_app',
    started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    completed_at: null,
    cancelled_at: null,
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: 'job-2',
    account_number: '234567890',
    target_mac: '00:2B:3C:4D:5E:6F',
    target_ip: '10.30.40.50',
    duration_minutes: 180,
    cadence_seconds: 60,
    reason: 'proactive',
    notification_email: 'jane.doe@company.com',
    alert_on_offline: true,
    alert_on_recovery: false,
    status: 'completed',
    alert_state: 'ok',
    requester_id: 'user-2',
    requester_name: 'Jane Doe',
    source: 'web_app',
    started_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    cancelled_at: null,
    created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'job-3',
    account_number: '345678901',
    target_mac: null,
    target_ip: '10.40.50.60',
    duration_minutes: 720,
    cadence_seconds: 300,
    reason: 'reactive',
    notification_email: 'john.smith@company.com',
    alert_on_offline: false,
    alert_on_recovery: false,
    status: 'cancelled',
    alert_state: 'ok',
    requester_id: 'user-1',
    requester_name: 'John Smith',
    source: 'tempo',
    started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    completed_at: null,
    cancelled_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');

  // Filter jobs based on search and status
  const filteredJobs = MOCK_JOBS.filter((job) => {
    const matchesSearch =
      searchQuery === '' ||
      job.account_number.includes(searchQuery) ||
      job.target_mac?.includes(searchQuery) ||
      job.target_ip?.includes(searchQuery) ||
      job.id.includes(searchQuery);

    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

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
            {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No jobs found matching your criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.account_number}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {job.target_mac || job.target_ip}
                    </TableCell>
                    <TableCell>{formatDurationFromMinutes(job.duration_minutes)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(job.status)}>
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(job.started_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {job.source === 'tempo' ? 'TeMPO' : 'Web'}
                      </Badge>
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
