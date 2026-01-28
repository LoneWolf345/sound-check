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
  Scatter,
  ScatterChart,
  ComposedChart,
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

export function RTTChart({ samples }: RTTChartProps) {
  const { chartData, outageRegions } = useMemo(() => {
    const data: ChartDataPoint[] = samples.map((sample, index) => ({
      time: new Date(sample.recorded_at).toLocaleTimeString(),
      rtt: sample.status === 'success' ? sample.rtt_ms : null,
      status: sample.status,
      index,
      recordedAt: sample.recorded_at,
    }));

    // Calculate outage regions (5+ consecutive misses)
    const regions: OutageRegion[] = [];
    let streakStart: number | null = null;
    let streakCount = 0;

    samples.forEach((sample, index) => {
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
      regions.push({ start: streakStart, end: samples.length - 1 });
    }

    return { chartData: data, outageRegions: regions };
  }, [samples]);

  // Get missed samples for scatter plot
  const missedPoints = chartData.filter(d => d.status === 'missed').map(d => ({
    ...d,
    y: 0,
  }));

  const systemErrorPoints = chartData.filter(d => d.status === 'system_error').map(d => ({
    ...d,
    y: 0,
  }));

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latency Over Time</CardTitle>
        <CardDescription>
          RTT (ms) for each ping attempt. Red markers indicate missed pings, yellow indicates system errors.
          Shaded areas show outage periods (5+ consecutive misses).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
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

              {/* RTT line */}
              <Line
                type="monotone"
                dataKey="rtt"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />

              {/* Missed ping markers on x-axis */}
              <Scatter
                data={missedPoints}
                dataKey="y"
                fill="hsl(var(--destructive))"
                shape={(props: any) => {
                  const { cx } = props;
                  return (
                    <circle
                      cx={cx}
                      cy={props.yAxis.y + props.yAxis.height}
                      r={4}
                      fill="hsl(var(--destructive))"
                    />
                  );
                }}
              />

              {/* System error markers */}
              <Scatter
                data={systemErrorPoints}
                dataKey="y"
                fill="hsl(38, 92%, 50%)"
                shape={(props: any) => {
                  const { cx } = props;
                  return (
                    <rect
                      x={cx - 3}
                      y={props.yAxis.y + props.yAxis.height - 3}
                      width={6}
                      height={6}
                      fill="hsl(38, 92%, 50%)"
                    />
                  );
                }}
              />
            </ComposedChart>
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
