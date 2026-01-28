
# Duplicate Modem/IP Validation for Running Jobs

## Overview
Add validation to prevent creating monitoring jobs when there's already a running job for the same modem (MAC address) or IP address. This prevents redundant monitoring and ensures resources are used efficiently.

---

## Implementation Approach

The validation will check for existing running jobs that match either:
- The same MAC address (if the new job uses MAC targeting)
- The same IP address (if the new job uses IP targeting)

---

## Files to Modify

### 1. `src/hooks/use-jobs.ts`
Add a new validation function to check for duplicate running jobs:

```typescript
// Check for duplicate running jobs by target MAC or IP
export async function checkDuplicateRunningJob(
  targetMac: string | null,
  targetIp: string | null
): Promise<{ isDuplicate: boolean; existingJobId?: string; matchType?: 'MAC' | 'IP' }> {
  // Build query for running jobs matching MAC or IP
  let query = supabase
    .from('jobs')
    .select('id, target_mac, target_ip')
    .eq('status', 'running');

  // Check MAC if provided
  if (targetMac) {
    const { data: macMatches } = await supabase
      .from('jobs')
      .select('id')
      .eq('status', 'running')
      .eq('target_mac', targetMac)
      .limit(1);
    
    if (macMatches && macMatches.length > 0) {
      return { isDuplicate: true, existingJobId: macMatches[0].id, matchType: 'MAC' };
    }
  }

  // Check IP if provided
  if (targetIp) {
    const { data: ipMatches } = await supabase
      .from('jobs')
      .select('id')
      .eq('status', 'running')
      .eq('target_ip', targetIp)
      .limit(1);
    
    if (ipMatches && ipMatches.length > 0) {
      return { isDuplicate: true, existingJobId: ipMatches[0].id, matchType: 'IP' };
    }
  }

  return { isDuplicate: false };
}
```

### 2. `src/pages/CreateJob.tsx`
Integrate the duplicate check into the form submission:

```typescript
// In onSubmit function, after usage limit check:

// Check for duplicate running jobs
const targetMac = data.targetType === 'mac' ? data.targetMac : null;
const targetIp = data.targetType === 'ip' ? data.targetIp : (accountData?.modems[0]?.managementIp ?? null);

const duplicateCheck = await checkDuplicateRunningJob(targetMac, targetIp);
if (duplicateCheck.isDuplicate) {
  toast({
    title: 'Duplicate Job Detected',
    description: `A monitoring job is already running for this ${duplicateCheck.matchType} address.`,
    variant: 'destructive',
    action: (
      <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${duplicateCheck.existingJobId}`)}>
        View Job
      </Button>
    ),
  });
  setIsSubmitting(false);
  return;
}
```

---

## User Experience

When a user tries to create a job for a modem/IP that already has a running job:

1. Form submission is blocked
2. Toast notification appears with:
   - Clear message explaining the duplicate
   - "View Job" button linking to the existing running job
3. User can choose to:
   - View/cancel the existing job
   - Modify their input to a different target

---

## Validation Logic Details

| Target Type | What's Checked | Match Condition |
|-------------|----------------|-----------------|
| MAC Address | `target_mac` column | Exact match (case-insensitive via database collation) |
| IP Address | `target_ip` column | Exact match |

The check only looks at jobs with `status = 'running'`. Completed, cancelled, or failed jobs do not block new jobs for the same target.

---

## Edge Cases Handled

1. **Same MAC, different IP**: Blocked (MAC match takes precedence)
2. **Same IP, different MAC**: Blocked (IP match)
3. **User uses MAC but existing job uses IP for same modem**: Not blocked (different identifiers)
4. **Case variations in MAC**: Should normalize MAC format before comparison

---

## Optional Enhancement: MAC Address Normalization

To handle different MAC address formats (00:1A:2B vs 001A2B vs 00-1A-2B), we can normalize before checking:

```typescript
function normalizeMac(mac: string): string {
  return mac.replace(/[:-]/g, '').toUpperCase();
}
```

This ensures `00:1A:2B:3C:4D:5E` and `001A2B3C4D5E` are treated as the same MAC.

---

## Summary

| Change | Purpose |
|--------|---------|
| Add `checkDuplicateRunningJob` function | Query database for existing running jobs with matching MAC/IP |
| Update `CreateJob.tsx` submission | Call duplicate check before creating job |
| Add user-friendly error toast | Show which type of duplicate and link to existing job |
| Normalize MAC addresses | Ensure consistent comparison regardless of format |
