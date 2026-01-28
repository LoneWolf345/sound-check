
# Phase 4: Email Sending - Implementation Plan

## Overview
Phase 4 implements the actual email sending functionality using a backend function and email service (Resend). When a job completes, the system will send a completion email to the requester with the job results summary, metric pass/fail status, and a link to the full job details.

---

## Part 1: Set Up Email Service Integration

### 1.1 Configure Resend API
The email sending will use Resend, which requires:

- User to create a Resend account at https://resend.com
- User to verify their email domain at https://resend.com/domains
- User to create an API key at https://resend.com/api-keys
- Add `RESEND_API_KEY` secret to the project

### 1.2 Create Email Sending Edge Function
Create `supabase/functions/send-completion-email/index.ts`:

- Accept job ID as input
- Fetch job and samples from database using service role key
- Calculate summary metrics
- Generate HTML email content matching the CompletionEmailPreview design
- Send via Resend API
- Return success/failure status

---

## Part 2: Email HTML Template

### 2.1 Create Email HTML Generator
The edge function will include an HTML template generator that produces:

- **Header**: Job completed notification with account number and target
- **Result Badge**: Prominent PASS/FAIL indicator with color styling
- **Metric Table**: Packet loss and p95 latency with thresholds and pass/fail
- **Statistics Summary**: Total samples, success rate, outage events, miss streaks
- **System Error Warning**: Conditional section if errors exceed 5%
- **Footer**: Link to job detail page and generation timestamp

### 2.2 Email Styling
- Inline CSS for email client compatibility
- Responsive design for mobile email clients
- Color-coded pass (green) / fail (red) badges
- Clean, professional layout matching the preview component

---

## Part 3: Trigger Email on Job Completion

### 3.1 Update Ping Simulator
Modify `src/lib/ping-simulator.ts`:

- After updating job status to 'completed', call the edge function
- Pass the job ID and job detail URL
- Handle success/failure response
- Log any email delivery errors

### 3.2 Alternative: Database Trigger (Future)
For production, a Postgres trigger or cron job would be more reliable than client-side triggering. This phase uses client-side for simplicity; Phase 5 could implement server-side triggers.

---

## Part 4: Track Email Delivery

### 4.1 Create Email Log Table (Optional Enhancement)
Could add an `email_logs` table to track:
- Job ID
- Recipient email
- Sent timestamp
- Delivery status
- Error message (if any)

For Phase 4, we'll use the existing `alerts` table delivery_status pattern or simply log to console.

---

## Technical Details

### Edge Function: send-completion-email

```text
supabase/functions/send-completion-email/index.ts

Request Body:
{
  "jobId": "uuid",
  "jobDetailUrl": "https://..."
}

Response:
{
  "success": true,
  "messageId": "resend-message-id"
}
```

### Email Content Structure

```text
+------------------------------------------+
|  MONITORING JOB COMPLETED                |
|  Account: 12345678 | 00:11:22:33:44:55   |
+------------------------------------------+
|                                          |
|           [PASS] or [FAIL]               |
|                                          |
+------------------------------------------+
|  JOB CONFIGURATION                       |
|  Duration: 1 hour | Cadence: 10 sec      |
|  Reason: Reactive | Started: Jan 28...   |
+------------------------------------------+
|  METRIC RESULTS                          |
|  Metric      | Value  | Threshold | Pass |
|  Packet Loss | 1.2%   | <= 2%     | PASS |
|  p95 Latency | 45ms   | <= 100ms  | PASS |
+------------------------------------------+
|  COLLECTION STATISTICS                   |
|  Total Samples: 360                      |
|  Successful: 354 (98.3%)                 |
|  Missed: 5                               |
|  Outage Events: 0                        |
|  Longest Miss Streak: 2                  |
|  System Errors: 1 (0.3%)                 |
+------------------------------------------+
|  [View Full Job Details]                 |
|  Generated: Jan 28, 2026 2:30 PM         |
+------------------------------------------+
```

### Files to Create

- `supabase/functions/send-completion-email/index.ts` - Main edge function
- `supabase/functions/send-completion-email/email-template.ts` - HTML generator (or inline)

### Files to Update

- `supabase/config.toml` - Add function configuration with `verify_jwt = false`
- `src/lib/ping-simulator.ts` - Add email trigger after job completion
- `.lovable/plan.md` - Update with Phase 4 completion status

### Calculation Logic in Edge Function

The edge function will replicate the `calculateJobSummary` logic:

```typescript
function calculateJobSummary(samples) {
  // Count by status
  // Calculate packet loss (missed / (success + missed))
  // Calculate RTT stats (avg, max, p95)
  // Count outage events (5+ consecutive misses)
  // Evaluate pass/fail against thresholds
}
```

### Security Considerations

- Edge function uses `verify_jwt = false` since it's called from client after job completion
- Uses `SUPABASE_SERVICE_ROLE_KEY` to read job/sample data
- Validates job exists before sending email
- Sanitizes email addresses before sending

### Required Secrets

- `RESEND_API_KEY` - Must be added by user via the secrets tool

---

## Implementation Steps

1. **Request RESEND_API_KEY** from user
2. **Create edge function** `send-completion-email/index.ts`
3. **Build HTML email template** with inline styles
4. **Update supabase/config.toml** with function config
5. **Modify ping-simulator.ts** to trigger email on completion
6. **Test end-to-end** with a sample job
7. **Update plan.md** with completion status

---

## Summary

Phase 4 adds real email delivery for job completion notifications:

- Backend function using Resend for reliable email delivery
- HTML email matching the existing preview design
- Automatic trigger when jobs complete
- Full metrics and pass/fail status in email body
- Direct link to job detail page for full results

This completes the core monitoring workflow where users can create jobs, monitor progress, and receive results via email.
