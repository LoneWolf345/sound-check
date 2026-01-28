import { useMemo } from 'react';
import { format } from 'date-fns';
import { 
  PlayCircle, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Bell,
  BellRing
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Job, Alert } from '@/types';

interface JobEventLogProps {
  job: Job;
  alerts?: Alert[];
}

interface EventItem {
  id: string;
  timestamp: Date;
  type: 'created' | 'started' | 'alert_offline' | 'alert_recovery' | 'completed' | 'cancelled';
  label: string;
  icon: React.ElementType;
  iconColor: string;
}

export function JobEventLog({ job, alerts = [] }: JobEventLogProps) {
  const events = useMemo<EventItem[]>(() => {
    const items: EventItem[] = [];

    // Job created
    items.push({
      id: 'created',
      timestamp: new Date(job.created_at),
      type: 'created',
      label: 'Job created',
      icon: PlayCircle,
      iconColor: 'text-primary',
    });

    // Job started (if different from created)
    if (job.started_at !== job.created_at) {
      items.push({
        id: 'started',
        timestamp: new Date(job.started_at),
        type: 'started',
        label: 'Monitoring started',
        icon: PlayCircle,
        iconColor: 'text-primary',
      });
    }

    // Alerts
    alerts.forEach((alert) => {
      const isOffline = alert.alert_type === 'offline';
      items.push({
        id: alert.id,
        timestamp: new Date(alert.triggered_at),
        type: isOffline ? 'alert_offline' : 'alert_recovery',
        label: isOffline ? 'Offline alert triggered' : 'Recovery alert triggered',
        icon: isOffline ? BellRing : Bell,
        iconColor: isOffline ? 'text-destructive' : 'text-emerald-500',
      });
    });

    // Job completed
    if (job.completed_at) {
      items.push({
        id: 'completed',
        timestamp: new Date(job.completed_at),
        type: 'completed',
        label: 'Job completed',
        icon: CheckCircle2,
        iconColor: 'text-emerald-500',
      });
    }

    // Job cancelled
    if (job.cancelled_at) {
      items.push({
        id: 'cancelled',
        timestamp: new Date(job.cancelled_at),
        type: 'cancelled',
        label: 'Job cancelled',
        icon: XCircle,
        iconColor: 'text-muted-foreground',
      });
    }

    // Sort by timestamp
    return items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [job, alerts]);

  return (
    <div className="space-y-0">
      {events.map((event, index) => {
        const Icon = event.icon;
        const isLast = index === events.length - 1;

        return (
          <div key={event.id} className="flex gap-3">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div className={cn('rounded-full p-1', event.iconColor)}>
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && (
                <div className="w-px h-full min-h-[24px] bg-border" />
              )}
            </div>

            {/* Event content */}
            <div className="pb-4">
              <p className="text-sm font-medium">{event.label}</p>
              <p className="text-xs text-muted-foreground">
                {format(event.timestamp, 'MMM d, yyyy h:mm:ss a')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
