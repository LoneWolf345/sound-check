
## What’s happening (root cause)

You’re still seeing **“Account {X} not found”** even though the real validation endpoint isn’t reachable because the current frontend flow can end up in “mock mode” without ever attempting the real API, and then the mock validator returns the generic “not found” message.

From the current code:

1) **The “Validate” button bypasses Zod/RHF validation**
- In `src/pages/CreateJob.tsx`, `handleValidateAccount()` reads the value via `form.getValues('accountNumber')` and only checks `length < 9`.
- It does **not** call `form.trigger('accountNumber')`, so the Zod rule:
  - test accounts: `^[123]\d{8}$`
  - real accounts: `^8160\d{12}$` (16 digits)
  can be bypassed by clicking Validate.
- Result: users can validate an invalid “real-looking” account (wrong length), and the system proceeds to `validateAccount()` anyway.

2) **In dev, the real API is not configured (so it never tries it)**
- `src/lib/account-validation.ts` only tries the real API if `import.meta.env.VITE_POLLER_SERVICE_URL` is set.
- When it’s not set, it always falls back to mock validation.
- When mock doesn’t recognize the number, it returns:
  - `code: 'ACCOUNT_NOT_FOUND'`
  - `message: Account {accountNumber} not found`
- That matches your console logs: **`[AccountValidation] Using mock validation`** (meaning the app never even attempted the endpoint).

So the “not found” message is not evidence that the endpoint was reached; it’s coming from the **mock fallback path**.

---

## Goal

When a user enters a real account number (starts with `8160`, exactly 16 digits):
- If the validation endpoint is **unreachable** → show **API_UNREACHABLE** (or similar), not “not found”.
- If the endpoint is **not configured in this environment** → show **API_NOT_CONFIGURED / API_UNAVAILABLE** with a clear message.
- Also prevent “Validate” from running at all when the account number format is invalid.

---

## Implementation Plan

### A) Enforce account format validation when clicking “Validate” (UI fix)
**File:** `src/pages/CreateJob.tsx`

1. Update `handleValidateAccount()` to run field validation before calling `validateAccount()`:
   - Add: `const isValid = await form.trigger('accountNumber');`
   - If not valid:
     - Do not call `validateAccount()`
     - Clear any previous API error state (optional) so the user only sees the form validation message
2. Remove/replace the current `length < 9` check, since it’s incomplete and contradicts the real-account rule.

**Why this matters:** it prevents scenarios like entering `8160...` with the wrong length and still getting a misleading “not found” from the mock layer.

---

### B) Make account-validation return accurate errors when real API isn’t available (logic fix)
**File:** `src/lib/account-validation.ts`

1. Add simple helpers (local, no exports needed):
   - `isTestAccountNumber(accountNumber)` → `^[123]\d{8}$`
   - `isRealAccountNumber(accountNumber)` → `^8160\d{12}$`

2. Adjust behavior when the poller-service URL is missing:
   - If `!POLLER_SERVICE_URL`:
     - If `isTestAccountNumber(accountNumber)`:
       - Run mock validation as today (success + maybe add a small warning like “Using test data”)
     - If `isRealAccountNumber(accountNumber)`:
       - Return **success: false** with:
         - `error.code = 'API_NOT_CONFIGURED'` (or `'API_UNAVAILABLE'`)
         - `error.message = 'Real account validation is not available in this environment right now. Please try again later or use test account 123456789.'`
       - This avoids “Account not found” which implies a lookup happened.
     - Else:
       - Return **success: false** with:
         - `error.code = 'INVALID_ACCOUNT_FORMAT'` (optional but helpful)
         - `error.message` matching your expected formats

3. Keep existing behavior when `POLLER_SERVICE_URL` is set:
   - If fetch throws → `API_UNREACHABLE`
   - If response is 404 → `ACCOUNT_NOT_FOUND`
   - Otherwise → success
   - If mock succeeds after API_UNREACHABLE → return warning toast as you already implemented

**Why this matters:** it distinguishes:
- “We tried, but can’t reach the service” vs
- “This environment isn’t set up to call the service” vs
- “The account truly does not exist”

---

### C) (Optional) Improve the user-facing message placement
**File:** `src/pages/CreateJob.tsx`

Right now you show:
- Zod errors via `<FormMessage />`
- API errors via the separate `accountError` banner

After step A, invalid-format issues will appear consistently in `FormMessage`, and API/service errors will appear in the banner. If you want everything in one place, we can consolidate later, but it’s not required to fix correctness.

---

## Acceptance criteria / how we’ll verify

1. Enter an invalid account like `8160123456789` (wrong length):
   - Clicking Validate should not call validation logic
   - Should show the form error: “Account must be 16 digits starting with 8160, or use test account 123456789”

2. Enter a valid real account format `8160XXXXXXXXXXXX` (16 digits):
   - In dev (no endpoint configured): should show **“Real account validation is not available in this environment…”**
   - No “Account not found”

3. Enter test account `123456789`:
   - Should succeed using mock and show the existing warning/toast behavior if applicable

4. In an environment where `VITE_POLLER_SERVICE_URL` is configured but unreachable:
   - Should show **API_UNREACHABLE** messaging, not “not found”

---

## Files to change

- `src/pages/CreateJob.tsx`
  - Add `form.trigger('accountNumber')` guard inside `handleValidateAccount()`
  - Remove the incomplete `length < 9` logic

- `src/lib/account-validation.ts`
  - Add explicit handling for “real account but API not configured”
  - Return clearer error codes/messages in mock fallback scenarios
