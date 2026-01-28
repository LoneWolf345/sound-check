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
  ReferenceDot,
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
  const { chartData, outageRegions, yDomain, missedIndices, errorIndices } = useMemo(() => {
    const data: ChartDataPoint[] = samples.map((sample, index) => ({
      time: new Date(sample.recorded_at).toLocaleTimeString(),
      rtt: sample.status === 'success' ? sample.rtt_ms : null,
      status: sample.status,
      index,
      recordedAt: sample.recorded_at,
    }));

    // Calculate Y-axis domain from actual RTT values
    const rttValues = data.map(d => d.rtt).filter((v): v is number => v !== null);
    const maxRtt = rttValues.length > 0 ? Math.max(...rttValues) : 100;
    const calculatedYDomain: [number, number] = [0, Math.max(maxRtt * 1.1, 10)];

    // Get indices for missed and error samples
    const missed = data.filter(d => d.status === 'missed').map(d => d.index);
    const errors = data.filter(d => d.status === 'system_error').map(d => d.index);

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

    return { 
      chartData: data, 
      outageRegions: regions, 
      yDomain: calculatedYDomain,
      missedIndices: missed,
      errorIndices: errors,
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

              {/* RTT line with dots */}
              <Line
                type="monotone"
                dataKey="rtt"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />

              {/* Missed ping markers at y=0 using ReferenceDot */}
              {missedIndices.map((idx) => (
                <ReferenceDot
                  key={`missed-${idx}`}
                  x={idx}
                  y={0}
                  r={4}
                  fill="hsl(var(--destructive))"
                  stroke="none"
                />
              ))}

              {/* System error markers at y=0 using ReferenceDot */}
              {errorIndices.map((idx) => (
                <ReferenceDot
                  key={`error-${idx}`}
                  x={idx}
                  y={0}
                  r={4}
                  fill="hsl(38, 92%, 50%)"
                  stroke="none"
                />
              ))}
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
