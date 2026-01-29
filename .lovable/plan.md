

# Remove Monitoring Mode Section - Auto-Detect Based on Test Account

## Overview
Simplify the job creation form by removing the manual "Monitoring Mode" selection. Instead, automatically determine the mode based on the account number:
- **Account `123456789`** → Use `simulated` mode (test/demo)
- **Any other account** → Use `real_polling` mode (production)

This creates a cleaner user experience while still allowing internal testing with mock data.

---

## Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/CreateJob.tsx` | Modify | Remove monitoring mode UI, auto-set based on account |
| `src/lib/mock-data.ts` | Modify | Update mock validation to accept `123456789` |

---

## Implementation Details

### 1. Update Form Schema

Remove `monitoringMode` from the form schema since it will be computed automatically:

**Before:**
```typescript
const jobFormSchema = z.object({
  // ... other fields
  monitoringMode: z.enum(['simulated', 'real_polling']),
});
```

**After:**
```typescript
const jobFormSchema = z.object({
  // ... other fields
  // monitoringMode removed - computed from account number
});
```

### 2. Define Test Account Constant

Add a constant for the test account number:

```typescript
const TEST_ACCOUNT_NUMBER = '123456789';
```

### 3. Remove Monitoring Mode Form Field

Remove the entire monitoring mode selection UI (lines 593-645 in the current file):
- The radio button selector for Simulated vs Real Polling
- The associated FormDescription

### 4. Compute Monitoring Mode at Submission

In the `onSubmit` function, determine the mode based on account number:

```typescript
async function onSubmit(data: JobFormValues) {
  // Determine monitoring mode based on account number
  const monitoringMode = data.accountNumber === TEST_ACCOUNT_NUMBER 
    ? 'simulated' 
    : 'real_polling';
  
  // ... rest of submission logic
  
  const job = await createJobMutation.mutateAsync({
    // ... other fields
    monitoring_mode: monitoringMode,
  });
  
  // Start simulator (only runs for simulated mode)
  startSimulator(job.id, data.cadenceSeconds, data.durationMinutes, undefined, monitoringMode);
}
```

### 5. Update Form Default Values

Remove the `monitoringMode` default value since it's no longer a form field.

### 6. Add Visual Indicator (Optional Enhancement)

When account `123456789` is validated, show a small badge indicating "Test Mode" so users know this will be simulated:

```tsx
{accountData && accountData.accountNumber === TEST_ACCOUNT_NUMBER && (
  <Badge variant="outline" className="text-xs bg-yellow-50 border-yellow-300 text-yellow-700">
    🧪 Test Account - Simulation Mode
  </Badge>
)}
```

### 7. Update Mock Validation

Update `src/lib/mock-data.ts` to explicitly accept `123456789`:

**Current validation:**
```typescript
if (/^[123]\d{8}$/.test(accountNumber)) {
  // valid
}
```

This already accepts `123456789` since it starts with `1` and has 9 digits. No change needed.

---

## Removed UI Elements

The following section will be completely removed from the form:

```tsx
<FormField
  control={form.control}
  name="monitoringMode"
  render={({ field }) => (
    <FormItem className="space-y-3">
      <FormLabel>Monitoring Mode</FormLabel>
      <FormControl>
        <div className="grid grid-cols-2 gap-3">
          {/* Simulated card */}
          {/* Real Polling card */}
        </div>
      </FormControl>
      <FormDescription>
        Select Simulated for testing or Real Polling for production monitoring.
      </FormDescription>
    </FormItem>
  )}
/>
```

---

## Updated Audit Log

The audit log will continue to capture the monitoring mode, but it will now be computed:

```typescript
await createAuditLogEntry({
  action: 'job.create',
  // ... other fields
  details: {
    // ...
    monitoring_mode: monitoringMode, // Computed value
  },
});
```

---

## User Experience Flow

1. User enters account number `123456789`
2. User clicks Validate → Shows "Account Validated" with "🧪 Test Account - Simulation Mode" badge
3. User enters any IP address
4. Device lookup shows mock data (already falls back to mock when real API unavailable)
5. User submits → Job created with `monitoring_mode: 'simulated'`
6. Browser-based simulator runs and generates mock ping data

**For Real Accounts:**
1. User enters real account number (e.g., `8160400020005238`)
2. Validation fetches from real billing API
3. IP lookup fetches from real SpreeDB API
4. Job created with `monitoring_mode: 'real_polling'`
5. OpenShift poller service handles actual ICMP pings

---

## Cleanup

Remove unused import if no longer needed:
- `Radio` from lucide-react (was used for the simulated mode icon)

