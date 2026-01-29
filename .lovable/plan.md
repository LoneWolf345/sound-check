

# Tighten Account Information Display Spacing

## Problem
The current layout uses `flex items-center justify-between` for each row, which pushes labels (Customer, Type, Status) to the left edge and values to the right edge, creating excessive visual distance between them.

## Solution
Change from `justify-between` (full-width spacing) to a more compact layout where labels and values are adjacent with minimal gap.

## Changes to `src/pages/CreateJob.tsx`

### Current Layout (lines 362-381):
```tsx
<div className="flex items-center justify-between">
  <span className="text-muted-foreground">Customer:</span>
  <span className="font-medium">{accountData.customerName}</span>
</div>
```

### Updated Layout:
```tsx
<div className="flex items-center gap-2">
  <span className="text-muted-foreground">Customer:</span>
  <span className="font-medium">{accountData.customerName}</span>
</div>
```

## Specific Changes

| Line | Change |
|------|--------|
| 363 | Change `justify-between` to `gap-2` |
| 367 | Change `justify-between` to `gap-2` |
| 373 | Change `justify-between` to `gap-2` |

This will place the label immediately next to the value with a small 0.5rem gap instead of pushing them to opposite sides of the container.

## Visual Comparison

**Before:**
```
Customer:                                    John Customer
Type:                                        [residential]
Status:                                           [active]
```

**After:**
```
Customer: John Customer
Type: [residential]
Status: [active]
```

## File to Modify

| File | Changes |
|------|---------|
| `src/pages/CreateJob.tsx` | Update 3 flex containers from `justify-between` to `gap-2` |

