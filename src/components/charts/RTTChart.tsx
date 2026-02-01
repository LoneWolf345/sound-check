import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Sample } from '@/types';

interface RTTChartProps {
  samples: Sample[];
}

interface ChartDataPoint {
  time: string;
  rtt: number | null;
  status: 'success' | 'missed' | 'system_error';
  index: number;
  recordedAt: string;
}

interface OutageRegion {
  start: number;
  end: number;
}

// Downsample samples for performance when there are too many data points
function downsample(samples: Sample[], maxPoints: number = 500): Sample[] {
  if (samples.length <= maxPoints) return samples;
  
  const step = Math.ceil(samples.length / maxPoints);
  return samples.filter((_, i) => i % step === 0);
}

export function RTTChart({ samples }: RTTChartProps) {
  const { chartData, outageRegions, yDomain, totalSamples, displayedSamples } = useMemo(() => {
    // Downsample for performance - limit to 500 points max
    const displaySamples = downsample(samples, 500);
    
    const data: ChartDataPoint[] = displaySamples.map((sample, index) => ({
      time: new Date(sample.recorded_at).toLocaleTimeString(),
      rtt: sample.status === 'success' ? sample.rtt_ms : null,
      status: sample.status,
      index,
      recordedAt: sample.recorded_at,
    }));

    // Round up to nearest "nice" number for stable Y-axis
    const roundToNice = (value: number): number => {
      if (value <= 50) return 50;
      if (value <= 100) return 100;
      if (value <= 200) return 200;
      return Math.ceil(value / 100) * 100;
    };

    // Calculate Y-axis domain from actual RTT values
    const rttValues = data.map(d => d.rtt).filter((v): v is number => v !== null);
    const maxRtt = rttValues.length > 0 ? Math.max(...rttValues) : 50;
    const calculatedYDomain: [number, number] = [0, roundToNice(maxRtt * 1.1)];

    // Calculate outage regions (5+ consecutive misses) on downsampled data
    const regions: OutageRegion[] = [];
    let streakStart: number | null = null;
    let streakCount = 0;

    displaySamples.forEach((sample, index) => {
      if (sample.status === 'missed') {
        if (streakStart === null) {
          streakStart = index;
        }
        streakCount++;
      } else if (sample.status === 'success') {
        if (streakCount >= 5 && streakStart !== null) {
          regions.push({ start: streakStart, end: index - 1 });
        }
        streakStart = null;
        streakCount = 0;
      }
    });

    // Handle trailing streak
    if (streakCount >= 5 && streakStart !== null) {
      regions.push({ start: streakStart, end: displaySamples.length - 1 });
    }

    return { 
      chartData: data, 
      outageRegions: regions, 
      yDomain: calculatedYDomain,
      totalSamples: samples.length,
      displayedSamples: displaySamples.length,
    };
  }, [samples]);

  if (chartData.length === 0) {
    return null;
  }

  // Calculate appropriate tick interval for X-axis
  const xAxisInterval = chartData.length <= 20 ? 0 : Math.floor(chartData.length / 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latency Over Time</CardTitle>
        <CardDescription>
          RTT (ms) for each ping attempt. Red markers indicate missed pings, yellow indicates system errors.
          Shaded areas show outage periods (5+ consecutive misses).
          {totalSamples > displayedSamples && (
            <span className="block mt-1 text-xs text-muted-foreground">
              Showing {displayedSamples} of {totalSamples} samples (downsampled for performance)
            </span>
          )}
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
                interval={xAxisInterval}
                tick={{ fontSize: 10 }}
                className="text-xs"
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v) => `${v}ms`}
                className="text-xs"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.length) {
                    const data = payload[0].payload as ChartDataPoint;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <p className="text-xs text-muted-foreground">{data.time}</p>
                        <p className="font-medium">
                          {data.status === 'success' && data.rtt !== null
                            ? `${Number(data.rtt).toFixed(1)} ms`
                            : data.status === 'missed'
                            ? 'Missed'
                            : 'System Error'}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          Status: {data.status.replace('_', ' ')}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Outage region shading */}
              {outageRegions.map((region, idx) => (
                <ReferenceArea
                  key={`outage-${idx}`}
                  x1={region.start}
                  x2={region.end}
                  fill="hsl(var(--destructive))"
                  fillOpacity={0.1}
                />
              ))}

              {/* p95 threshold line */}
              <ReferenceLine
                y={100}
                stroke="hsl(var(--destructive))"
                strokeDasharray="5 5"
                label={{ value: 'p95 threshold', position: 'right', fontSize: 10 }}
              />

              {/* RTT line with custom dots for status markers */}
              <Line
                type="monotone"
                dataKey="rtt"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls={false}
                activeDot={{ r: 5 }}
                dot={(props: any) => {
                  const { cx, cy, payload, index } = props;
                  if (!cx || cx === null) return null;
                  
                  if (payload.status === 'missed') {
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx}
                        cy={props.yAxis?.y + props.yAxis?.height || 0}
                        r={4}
                        fill="hsl(var(--destructive))"
                      />
                    );
                  }
                  if (payload.status === 'system_error') {
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx}
                        cy={props.yAxis?.y + props.yAxis?.height || 0}
                        r={4}
                        fill="hsl(38, 92%, 50%)"
                      />
                    );
                  }
                  if (payload.status === 'success' && cy !== null) {
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx}
                        cy={cy}
                        r={3}
                        fill="hsl(var(--primary))"
                      />
                    );
                  }
                  return null;
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-primary" />
            <span className="text-muted-foreground">RTT</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span className="text-muted-foreground">Missed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-amber-500" />
            <span className="text-muted-foreground">System Error</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 bg-destructive/10 border border-destructive/30" />
            <span className="text-muted-foreground">Outage Period</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
