import { useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Search, Filter, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { formatDateTime } from '@/lib/format';
import type { AuditLog } from '@/types';

// Mock audit logs
const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-1',
    actor_id: 'user-1',
    actor_name: 'John Smith',
    action: 'job.create',
    entity_type: 'job',
    entity_id: 'job-1',
    details: { account_number: '123456789', duration_minutes: 60 },
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: 'audit-2',
    actor_id: 'admin-1',
    actor_name: 'Admin User',
    action: 'admin.config.change',
    entity_type: 'admin_config',
    entity_id: null,
    details: { key: 'thresholds', before: { packet_loss_percent: 2 }, after: { packet_loss_percent: 3 } },
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'audit-3',
    actor_id: 'user-2',
    actor_name: 'Jane Doe',
    action: 'job.cancel',
    entity_type: 'job',
    entity_id: 'job-3',
    details: { reason: 'User requested' },
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'audit-4',
    actor_id: null,
    actor_name: 'System',
    action: 'alert.triggered',
    entity_type: 'alert',
    entity_id: 'alert-1',
    details: { job_id: 'job-1', alert_type: 'offline' },
    created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'audit-5',
    actor_id: null,
    actor_name: 'System',
    action: 'job.complete',
    entity_type: 'job',
    entity_id: 'job-2',
    details: { overall_pass: true },
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
];

function getActionBadgeVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action.includes('create') || action.includes('complete')) return 'default';
  if (action.includes('cancel') || action.includes('alert')) return 'destructive';
  if (action.includes('config')) return 'secondary';
  return 'outline';
}

export default function AuditLog() {
  const { isAdmin } = useUser();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  const filteredLogs = MOCK_AUDIT_LOGS.filter((log) => {
    const matchesSearch =
      searchQuery === '' ||
      log.actor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_id?.includes(searchQuery);

    const matchesAction =
      actionFilter === 'all' ||
      log.action.startsWith(actionFilter);

    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          View all system actions and changes.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by actor, action, or entity ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={actionFilter}
              onValueChange={setActionFilter}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="job">Job Actions</SelectItem>
                <SelectItem value="alert">Alerts</SelectItem>
                <SelectItem value="admin">Admin Changes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            {filteredLogs.length} event{filteredLogs.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No audit logs found matching your criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      {log.actor_name || 'System'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.entity_type}
                      {log.entity_id && ` / ${log.entity_id.substring(0, 8)}...`}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {log.details ? JSON.stringify(log.details) : '—'}
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
