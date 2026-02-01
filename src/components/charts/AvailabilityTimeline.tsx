import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Sample, SampleStatus } from '@/types';
import { format } from 'date-fns';

interface AvailabilityTimelineProps {
  samples: Sample[];
  startTime: Date;
  endTime?: Date;
  height?: number;
}

const STATUS_COLORS: Record<SampleStatus, string> = {
  success: 'bg-emerald-500',
  missed: 'bg-destructive',
  system_error: 'bg-amber-500',
};

const STATUS_LABELS: Record<SampleStatus, string> = {
  success: 'Success',
  missed: 'Missed',
  system_error: 'System Error',
};

export function AvailabilityTimeline({
  samples,
  startTime,
  endTime,
  height = 32,
}: AvailabilityTimelineProps) {
  const sortedSamples = useMemo(
    () =>
      [...samples].sort((a, b) => {
        const at = new Date(a.recorded_at).getTime();
        const bt = new Date(b.recorded_at).getTime();
        if (at !== bt) return at - bt;
        return a.sequence_number - b.sequence_number;
      }),
    [samples]
  );

  const timeMarkers = useMemo(() => {
    if (sortedSamples.length === 0) return [];
    
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date(sortedSamples[sortedSamples.length - 1]?.recorded_at || startTime);
    const duration = end.getTime() - start.getTime();
    
    // Generate 5 time markers
    const markers = [];
    for (let i = 0; i <= 4; i++) {
      const time = new Date(start.getTime() + (duration * i) / 4);
      markers.push({
        time,
        position: (i / 4) * 100,
      });
    }
    return markers;
  }, [sortedSamples, startTime, endTime]);

  if (sortedSamples.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No samples collected yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Timeline strip */}
      <TooltipProvider delayDuration={100}>
        <div
          className="flex rounded-md overflow-hidden border"
          style={{ height }}
        >
          {sortedSamples.map((sample, index) => (
            <Tooltip key={sample.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex-1 min-w-[2px] transition-opacity hover:opacity-80 cursor-pointer',
                    STATUS_COLORS[sample.status]
                  )}
                  style={{
                    flexGrow: 1,
                    flexShrink: 1,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <p className="font-medium">Sample #{sample.sequence_number}</p>
                  <p>{format(new Date(sample.recorded_at), 'MMM d, h:mm:ss a')}</p>
                  <p className={cn(
                    'font-medium',
                    sample.status === 'success' && 'text-emerald-500',
                    sample.status === 'missed' && 'text-destructive',
                    sample.status === 'system_error' && 'text-amber-500'
                  )}>
                    {STATUS_LABELS[sample.status]}
                    {sample.status === 'success' && sample.rtt_ms !== null && (
                      <span className="text-muted-foreground ml-1">
                        ({sample.rtt_ms.toFixed(1)} ms)
                      </span>
                    )}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* Time markers */}
      <div className="relative h-4 text-xs text-muted-foreground">
        {timeMarkers.map((marker, index) => (
          <span
            key={index}
            className="absolute transform -translate-x-1/2"
            style={{ left: `${marker.position}%` }}
          >
            {format(marker.time, 'h:mm a')}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="text-muted-foreground">Success</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-destructive" />
          <span className="text-muted-foreground">Missed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-amber-500" />
          <span className="text-muted-foreground">System Error</span>
        </div>
      </div>
    </div>
  );
}
