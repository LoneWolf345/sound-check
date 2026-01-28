

# Phase 3: Results & Visualization - Implementation Plan

## Overview
Phase 3 focuses on enhancing the visual presentation of job results with an availability timeline strip, improving the existing RTT chart, and creating a completion email preview component. This phase makes results clearer and more actionable for frontline associates.

---

## Part 1: Availability Timeline Strip

### 1.1 Create AvailabilityTimeline Component
Create a new component `src/components/charts/AvailabilityTimeline.tsx`:

- A horizontal strip showing each sample as a colored segment
- Color coding:
  - Green: success
  - Red: missed
  - Yellow/Orange: system_error
- Hover tooltip showing timestamp and status
- Supports scrolling for long job durations
- Shows time markers at regular intervals

### 1.2 Integrate into JobDetail.tsx
- Add the availability timeline below the RTT chart
- Show as a compact strip visualization
- Useful for quickly identifying outage patterns

---

## Part 2: Enhanced RTT Chart

### 2.1 Mark Missed Pings on Chart
Update the RTT LineChart in JobDetail.tsx:

- Add scatter points for missed pings (red markers on X-axis)
- Show vertical bands for outage periods (5+ consecutive misses)
- Add legend showing success/missed/system_error colors
- Improve tooltip to show sample status

### 2.2 Chart Improvements
- Add zoom/pan capability for long duration jobs
- Show p95 threshold reference line (100ms - already implemented)
- Show time-based X-axis instead of sample index for longer jobs

---

## Part 3: Completion Email Preview

### 3.1 Create EmailPreview Component
Create `src/components/email/CompletionEmailPreview.tsx`:

- Renders email content that would be sent on job completion
- Uses the job and summary data to generate preview
- Matches the email specification from requirements

### 3.2 Email Content Structure
Based on the requirements, the email must include:

1. **Header Section**
   - Job completed notification
   - Account number and target identifier
   - Duration, cadence, and reason

2. **Results Summary**
   - Overall PASS/FAIL badge (prominent)
   - Pass/fail table for each metric:
     - Packet Loss: X% (PASS/FAIL)
     - p95 Latency: X ms (PASS/FAIL)

3. **Visual Charts (Static Representations)**
   - RTT time-series summary (min/avg/max/p95)
   - Availability summary (% success, outage count)
   - Note: In mock implementation, show chart descriptions or static representations

4. **Statistics Table**
   - Total samples collected
   - Success count and rate
   - Missed count
   - Outage events
   - Longest miss streak
   - System error count

5. **System Error Note**
   - Only shown if system errors exceed 5% of total samples
   - Warning about potential data reliability issues

6. **Footer**
   - Link to full job detail page
   - Timestamp of email generation

### 3.3 Add Email Preview to JobDetail
- Show "Email Preview" button for completed jobs
- Opens a dialog/modal with the rendered email content
- Include "Copy to Clipboard" functionality (for testing)

---

## Part 4: Job Detail Page Enhancements

### 4.1 Event Log Section
Add an event log showing job lifecycle:

- Job created
- Job started
- Alerts triggered (with timestamps)
- Job cancelled/completed

### 4.2 Improved Layout
- Better organization of metrics, charts, and configuration
- Collapsible sections for detailed information
- Print-friendly view option

---

## Technical Details

### New Files to Create
- `src/components/charts/AvailabilityTimeline.tsx` - Timeline strip component
- `src/components/email/CompletionEmailPreview.tsx` - Email preview component

### Files to Update
- `src/pages/JobDetail.tsx` - Add timeline, enhance chart, add email preview, add event log

### Component Architecture

```
JobDetail.tsx
├── Header (job info, status, actions)
├── Progress bar (running jobs only)
├── Metric tiles (packet loss, p95, avg RTT, success rate, etc.)
├── RTT Chart (enhanced with missed ping markers)
├── AvailabilityTimeline (new - color-coded strip)
├── Event Log (new - lifecycle events)
├── Job Configuration (existing)
└── Email Preview Dialog (new - for completed jobs)
```

### AvailabilityTimeline Component Props

```typescript
interface AvailabilityTimelineProps {
  samples: Sample[];
  startTime: Date;
  endTime?: Date;
  height?: number;
}
```

### CompletionEmailPreview Component Props

```typescript
interface CompletionEmailPreviewProps {
  job: Job;
  summary: JobSummary;
  samples: Sample[];
}
```

---

## Summary
Phase 3 enhances the visualization and reporting capabilities:
- Availability timeline strip for quick visual pattern recognition
- Enhanced RTT chart with missed ping markers
- Completion email preview for testing notification content
- Event log for job lifecycle tracking

This phase improves the user experience by making job results clearer and more actionable, while also preparing the foundation for the actual email sending in Phase 4.

