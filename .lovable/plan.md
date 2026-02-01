
# Plan: Fix RTT Chart Animation Issues

## Problem Summary
The Latency Over Time chart exhibits jarring animations when new samples arrive during a running job. This is caused by Recharts re-animating the entire line from scratch on every data update, combined with dynamic Y-axis rescaling.

## Solution Overview
Disable animations for real-time data updates while preserving smooth visual transitions through CSS and strategic component optimizations.

---

## Implementation Steps

### 1. Disable Line Animation on Data Updates
Modify the `<Line>` component to disable the default stroke-dasharray animation that causes the entire line to redraw on each update.

**Changes to `RTTChart.tsx`:**
- Add `isAnimationActive={false}` to the Line component
- This prevents the jarring "line drawing" effect when new samples arrive

### 2. Stabilize Y-Axis Domain
Prevent the Y-axis from constantly rescaling by implementing a more stable domain calculation that only expands (never shrinks) during a running job.

**Approach:**
- Round the max Y value up to the nearest "nice" number (e.g., 50, 100, 150)
- Add a minimum Y-axis height to prevent wild scaling with initial low values

### 3. Replace Individual ReferenceDots with Custom Scatter Points
Instead of rendering hundreds of `<ReferenceDot>` components (one per missed/error sample), use a single `<Scatter>` series or custom dot rendering for better performance.

**Approach:**
- Use the Line component's `dot` prop with a custom render function
- Render missed/error markers as part of the same render pass

### 4. Add CSS Transitions for Smooth Updates
Apply CSS transitions to chart elements for smoother visual updates without the SVG animation overhead.

**Approach:**
- Add transition classes to the chart container
- Ensure dots and markers transition smoothly

### 5. Memoize Chart Data Transformation
Ensure the `useMemo` hook properly prevents unnecessary recalculations by verifying the dependency array is correct.

---

## Technical Details

### File: `src/components/charts/RTTChart.tsx`

#### Animation Disable
```tsx
<Line
  type="monotone"
  dataKey="rtt"
  stroke="hsl(var(--primary))"
  strokeWidth={2}
  dot={{ r: 3, fill: 'hsl(var(--primary))' }}
  activeDot={{ r: 5 }}
  connectNulls={false}
  isAnimationActive={false}  // Disable re-animation on data updates
/>
```

#### Stable Y-Domain Calculation
```tsx
// Round up to nearest "nice" number for stable Y-axis
const roundToNice = (value: number): number => {
  if (value <= 50) return 50;
  if (value <= 100) return 100;
  if (value <= 200) return 200;
  return Math.ceil(value / 100) * 100;
};

const calculatedYDomain: [number, number] = [0, roundToNice(maxRtt * 1.1)];
```

#### Custom Dot Rendering for Status Markers
Replace individual ReferenceDot components with a custom dot render function:
```tsx
<Line
  // ... other props
  dot={(props) => {
    const { cx, cy, payload } = props;
    if (payload.status === 'missed') {
      return <circle cx={cx} cy={yDomain[0]} r={4} fill="hsl(var(--destructive))" />;
    }
    if (payload.status === 'system_error') {
      return <circle cx={cx} cy={yDomain[0]} r={4} fill="hsl(38, 92%, 50%)" />;
    }
    if (payload.status === 'success') {
      return <circle cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" />;
    }
    return null;
  }}
/>
```

---

## Expected Outcome

After implementation:
- New samples will appear instantly without the line "redrawing" animation
- Y-axis will remain stable, only expanding when necessary
- Performance will improve for long-duration jobs with many samples
- The visual experience will feel responsive and professional

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/charts/RTTChart.tsx` | Disable animations, stable Y-domain, custom dot rendering |
