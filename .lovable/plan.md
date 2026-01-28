
# Fix RTTChart Display Issues

## Problem Analysis
The chart has several rendering issues:
1. **Y-axis scale is incorrect** - Shows 0-4ms when actual data ranges from 29-131ms
2. **RTT line is not visible** - Being drawn off the visible Y-axis scale
3. **Sparse X-axis labels** - Only showing #3 and #5 instead of all sample indices

### Root Cause
The `Scatter` components use separate `data` arrays with `y: 0` values. When Recharts calculates the Y-axis domain, it's including these zero values and ignoring the actual RTT data from the Line component, resulting in a 0-4ms scale instead of the proper 0-150ms scale.

## Solution

### 1. Fix Y-axis Domain Calculation
Explicitly calculate Y-axis domain from RTT values instead of relying on auto-scaling:

```typescript
const maxRtt = Math.max(...rttValues.filter(v => v !== null), 0);
const yDomain = [0, Math.max(maxRtt * 1.1, 10)]; // 10% padding, min 10ms
```

### 2. Fix Scatter Component Rendering
Instead of using separate `data` arrays for Scatter (which breaks Y-axis), render markers differently:
- Use `dot` prop on Line component with custom render for successful points
- Render missed/error markers using `customized` component or ReferenceDot

### 3. Improve X-axis Tick Display
Configure XAxis to show more tick marks for better visibility:

```typescript
<XAxis 
  dataKey="index"
  tickFormatter={(i) => `#${i + 1}`}
  interval={0} // Show all ticks for small datasets
  tick={{ fontSize: 10 }}
/>
```

### 4. Add Dots for Successful Pings
Enable dots on the line to make data points more visible, especially when there are gaps from missed pings.

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/charts/RTTChart.tsx` | Fix Y-axis domain, scatter rendering, X-axis ticks |

## Implementation Details

1. **Calculate explicit Y-axis domain** from successful RTT values
2. **Replace Scatter components** with ReferenceDot or custom dot rendering that doesn't affect axis scaling
3. **Show all X-axis ticks** when sample count is small (< 20)
4. **Enable dots on Line** for better visibility of data points
5. **Use `yAxisId`** to isolate scatter points from main Y-axis if needed

## Expected Outcome
- Y-axis properly scaled (0-150ms for this data)
- RTT line visible with dots at each successful ping
- Red markers at bottom for missed pings (not affecting Y scale)
- All sample indices visible on X-axis
- Outage shading when 5+ consecutive misses exist
