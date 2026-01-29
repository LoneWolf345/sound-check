

# Improve Account Validation Error Reporting

## Problem
When using a real account number in the dev environment, the poller service API cannot be reached. The current code silently falls back to mock validation, which rejects real account numbers with a misleading "Account not found" error.

**Current Flow:**
1. API call fails (network error/unreachable)
2. Falls through to mock validation
3. Real account number doesn't match mock pattern (`^[123]\d{8}$`)
4. Returns "Account not found" - **misleading!**

## Solution
Add specific error codes and messages to distinguish between failure scenarios:

| Scenario | Error Code | User Message |
|----------|------------|--------------|
| Network error/timeout | `API_UNREACHABLE` | "Unable to reach validation service. Using test mode instead." |
| API returned 404 | `ACCOUNT_NOT_FOUND` | "Account {number} not found" |
| API returned error | `API_ERROR` | "Validation service error: {details}" |
| Mock fallback, no match | `MOCK_NO_MATCH` | "Account not found in test data. Try test account 123456789." |

## Changes to `src/lib/account-validation.ts`

### 1. Track API failure reason

Instead of silently falling through to mock, capture the specific failure:

```typescript
export async function validateAccount(accountNumber: string): Promise<AccountValidationResult> {
  let apiError: { code: string; message: string } | null = null;
  
  if (POLLER_SERVICE_URL) {
    try {
      const response = await fetch(...);
      
      if (!response.ok) {
        // API responded with error status
        if (response.status === 404) {
          return {
            success: false,
            error: { code: 'ACCOUNT_NOT_FOUND', message: `Account ${accountNumber} not found` },
            source: 'api',
          };
        }
        // Other API errors
        return {
          success: false,
          error: { code: 'API_ERROR', message: `Validation service returned status ${response.status}` },
          source: 'api',
        };
      }
      
      const result = await response.json();
      return { ...result, source: 'api' };
      
    } catch (error) {
      // Network error - capture for later
      apiError = {
        code: 'API_UNREACHABLE',
        message: error instanceof Error ? error.message : 'Unable to reach validation service',
      };
      console.warn('[AccountValidation] API unreachable:', apiError.message);
    }
  }
  
  // Mock validation fallback
  const mockResult = await mockValidateAccount(accountNumber);
  
  if (mockResult) {
    return {
      success: true,
      account: convertMockToValidatedAccount(mockResult),
      source: 'mock',
      warning: apiError ? 'Validation service unavailable. Using test data.' : undefined,
    };
  }
  
  // Mock didn't match - provide helpful message
  return {
    success: false,
    error: {
      code: apiError ? 'API_UNREACHABLE' : 'ACCOUNT_NOT_FOUND',
      message: apiError 
        ? `Unable to reach validation service. For testing, use account 123456789.`
        : `Account ${accountNumber} not found`,
    },
    source: 'mock',
  };
}
```

### 2. Add warning field to result interface

```typescript
export interface AccountValidationResult {
  success: boolean;
  account?: ValidatedAccount;
  error?: {
    code: string;
    message: string;
  };
  warning?: string;  // NEW: Non-blocking warning message
  source: 'api' | 'mock';
}
```

### 3. Update CreateJob.tsx to show warnings

Display the warning when API was unreachable but mock succeeded:

```typescript
// In handleValidateAccount:
if (result.success && result.account) {
  setAccountData(result.account);
  if (result.warning) {
    // Show non-blocking warning
    toast({
      title: 'Notice',
      description: result.warning,
      variant: 'default',
    });
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/account-validation.ts` | Improve error handling with specific codes and messages |
| `src/pages/CreateJob.tsx` | Display warning toast when API unreachable but mock works |

## User Experience

**Scenario 1: Real account, API unreachable (dev environment)**
- Error: "Unable to reach validation service. For testing, use account 123456789."
- Error code: `API_UNREACHABLE`

**Scenario 2: Test account 123456789, API unreachable**
- Success with mock data
- Toast warning: "Validation service unavailable. Using test data."

**Scenario 3: Real account, API reachable, account not found**
- Error: "Account 8160400020005238 not found"
- Error code: `ACCOUNT_NOT_FOUND`

