
# Rebrand to "Soundcheck"

## Overview
Rename the application from "Modem Monitor" to "Soundcheck" and add a fitting logo icon that represents signal/connectivity monitoring.

---

## Logo Icon Selection

Given the "Soundcheck" name (which evokes audio testing, signal verification, connectivity checks), the following Lucide icons would be fitting:

| Icon | Reasoning |
|------|-----------|
| **AudioWaveform** | Directly relates to "sound" and signal patterns |
| **Radio** | Represents wireless connectivity/signals |
| **Activity** | Shows signal/pulse monitoring (already used elsewhere) |
| **Gauge** | Represents measurement/testing |

**Recommendation:** Use `AudioWaveform` as it best captures the "Soundcheck" metaphor - checking signals like checking audio levels before a performance.

---

## Files to Modify

### 1. `index.html`
Update document title and meta tags:
- Title: "Lovable App" → "Soundcheck"
- og:title: "Lovable App" → "Soundcheck"  
- description: "Lovable Generated Project" → "Monitor connectivity and track modem issues in real-time"
- og:description: Same as above

### 2. `src/components/layout/AppLayout.tsx`
Update the header logo section:
- Replace the `<div>` with "MM" text with the `AudioWaveform` Lucide icon
- Change "Modem Monitor" text to "Soundcheck"

```tsx
// Before
<div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
  <span className="text-xs font-bold text-primary-foreground">MM</span>
</div>
<span>Modem Monitor</span>

// After  
<AudioWaveform className="h-6 w-6 text-primary" />
<span>Soundcheck</span>
```

### 3. `supabase/functions/send-completion-email/index.ts`
Update email branding:
- Email sender: "Modem Monitor" → "Soundcheck"
- Footer text: "Modem Monitoring System" → "Soundcheck"

### 4. `src/types/index.ts`
Update the comment:
- "Modem Monitoring Tool" → "Soundcheck - Connectivity Monitoring Tool"

---

## Visual Result

The header will display:
```
[AudioWaveform Icon] Soundcheck    Dashboard   New Job   Jobs   ...
```

The icon uses the primary color and scales nicely at 24x24 pixels, providing a professional look that matches the app's purpose.

---

## Implementation Steps

1. Update `index.html` with new title, description, and meta tags
2. Import `AudioWaveform` in AppLayout and replace the logo section
3. Update email function with new branding
4. Update type comment for consistency

---

## Summary

| Location | Current | New |
|----------|---------|-----|
| Browser tab | "Lovable App" | "Soundcheck" |
| Header logo | "MM" box | AudioWaveform icon |
| Header text | "Modem Monitor" | "Soundcheck" |
| Email sender | "Modem Monitor" | "Soundcheck" |
| Email footer | "Modem Monitoring System" | "Soundcheck" |
