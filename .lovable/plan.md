
# Dynamic Duration Presets with Unit Selection

## Overview
Transform the fixed duration presets array into a dynamic list where admins can add, edit, and remove entries. Each entry will have a numeric value and a selectable unit (minutes, hours, or days).

---

## Current State

The duration presets are currently stored as:
```typescript
interface DurationPresetsConfig {
  presets: number[];  // e.g., [60, 180, 360, 720, 1440, 2880] (all in minutes)
  default: number;    // e.g., 60
}
```

The Admin Settings page displays these as a fixed grid of 6 input fields, all in minutes.

---

## Proposed Data Structure

### New Type Definition
```typescript
type DurationUnit = 'minutes' | 'hours' | 'days';

interface DurationPreset {
  value: number;      // The numeric value (e.g., 1, 3, 6)
  unit: DurationUnit; // The unit (e.g., 'hours')
}

interface DurationPresetsConfig {
  presets: DurationPreset[];  // Array of preset objects
  default: number;            // Default value in minutes (for backward compatibility)
}
```

### Example Data
```json
{
  "presets": [
    { "value": 1, "unit": "hours" },
    { "value": 3, "unit": "hours" },
    { "value": 6, "unit": "hours" },
    { "value": 12, "unit": "hours" },
    { "value": 1, "unit": "days" },
    { "value": 2, "unit": "days" }
  ],
  "default": 60
}
```

---

## UI Design

### Admin Settings - Duration Presets Card

```text
+--------------------------------------------------+
|  [Clock Icon] Duration Presets                   |
|  Configure available monitoring duration options |
+--------------------------------------------------+
|                                                  |
|  +--------+  +----------+  +--------+            |
|  |   1    |  | hours  v |  |   X    |            |
|  +--------+  +----------+  +--------+            |
|                                                  |
|  +--------+  +----------+  +--------+            |
|  |   3    |  | hours  v |  |   X    |            |
|  +--------+  +----------+  +--------+            |
|                                                  |
|  +--------+  +----------+  +--------+            |
|  |   6    |  | hours  v |  |   X    |            |
|  +--------+  +----------+  +--------+            |
|                                                  |
|  +--------+  +----------+  +--------+            |
|  |   12   |  | hours  v |  |   X    |            |
|  +--------+  +----------+  +--------+            |
|                                                  |
|  +--------+  +----------+  +--------+            |
|  |   1    |  | days   v |  |   X    |            |
|  +--------+  +----------+  +--------+            |
|                                                  |
|  +--------+  +----------+  +--------+            |
|  |   2    |  | days   v |  |   X    |            |
|  +--------+  +----------+  +--------+            |
|                                                  |
|  [+ Add Duration Preset]                         |
|                                                  |
|  Default: [  1  v] [hours v]                     |
|                                                  |
+--------------------------------------------------+
```

### Features
- Each row has: numeric input, unit dropdown, delete button
- "Add Duration Preset" button at the bottom
- Minimum of 1 preset required (delete disabled when only 1 remains)
- Default selector with its own value/unit combination

---

## Implementation Steps

### Step 1: Update Type Definitions
**File:** `src/types/index.ts`

- Add `DurationUnit` type
- Add `DurationPreset` interface
- Update `DurationPresetsConfig` to use the new structure

### Step 2: Add Conversion Utilities
**File:** `src/lib/format.ts`

- Add `convertToMinutes(value: number, unit: DurationUnit): number`
- Add `findBestUnit(minutes: number): { value: number, unit: DurationUnit }`
- Update `formatDurationFromMinutes` if needed for display consistency

### Step 3: Update Admin Config Hook
**File:** `src/hooks/use-admin-config.ts`

- Update `DEFAULT_DURATION_PRESETS` to use new structure
- Add migration logic to convert old format to new format when loading

### Step 4: Create Duration Preset Editor Component
**File:** `src/components/admin/DurationPresetEditor.tsx` (new)

- Reusable component for editing a single preset
- Props: `value`, `unit`, `onChange`, `onDelete`, `canDelete`
- Includes number input and unit Select dropdown

### Step 5: Update Admin Settings Page
**File:** `src/pages/AdminSettings.tsx`

- Replace fixed grid with dynamic list
- Add/Edit/Remove functionality for presets
- Update local state management
- Add validation (no duplicates, at least 1 preset)

### Step 6: Update Create Job Page
**File:** `src/pages/CreateJob.tsx`

- Convert preset objects to minutes when populating the duration dropdown
- Ensure display uses `formatDurationFromMinutes` which already handles all units

---

## Technical Details

### Conversion Functions

```typescript
// Convert preset to minutes for storage/comparison
function convertToMinutes(value: number, unit: DurationUnit): number {
  switch (unit) {
    case 'minutes': return value;
    case 'hours': return value * 60;
    case 'days': return value * 1440;
  }
}

// Find best unit for display (used for migration)
function findBestUnit(minutes: number): { value: number, unit: DurationUnit } {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: minutes / 1440, unit: 'days' };
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return { value: minutes / 60, unit: 'hours' };
  }
  return { value: minutes, unit: 'minutes' };
}
```

### Backward Compatibility

When loading config from database, check if presets are in old format (array of numbers) and convert:

```typescript
function migratePresets(config: any): DurationPresetsConfig {
  if (Array.isArray(config.presets) && typeof config.presets[0] === 'number') {
    // Old format: convert to new
    return {
      presets: config.presets.map(m => findBestUnit(m)),
      default: config.default,
    };
  }
  return config;
}
```

### Validation Rules

1. At least 1 preset must exist
2. No duplicate duration values (same total minutes)
3. Value must be positive integer
4. Default must match one of the presets (or auto-select first)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/admin/DurationPresetEditor.tsx` | Reusable preset row component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `DurationUnit`, `DurationPreset`, update `DurationPresetsConfig` |
| `src/lib/format.ts` | Add `convertToMinutes`, `findBestUnit` utilities |
| `src/hooks/use-admin-config.ts` | Update defaults, add migration logic |
| `src/pages/AdminSettings.tsx` | Replace fixed grid with dynamic list editor |
| `src/pages/CreateJob.tsx` | Update to handle new preset format |

---

## Summary

This enhancement transforms the duration presets from a fixed array of minutes into a flexible, admin-manageable list where each entry specifies both a value and unit. The changes maintain backward compatibility with existing database records through automatic migration, and the Create Job form will continue to work seamlessly by converting presets to minutes for the duration selector.
