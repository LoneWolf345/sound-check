
# Plan: Allow Anonymous Dashboard Access with Optional Login

## Overview

Make the dashboard and job pages publicly accessible without requiring login. Authenticated users will have additional capabilities (create/manage jobs), while anonymous users can view all data. Add a "Sign In" button in the top-right corner for users who want to log in.

---

## Current State

- All routes except `/login`, `/register`, and `/sso/callback` are wrapped in `ProtectedRoute`
- `ProtectedRoute` redirects unauthenticated users to `/login`
- `AppLayout` assumes user is logged in and shows user menu with sign out
- RLS policies already allow SELECT for all users (authenticated or not)

---

## Implementation Steps

### Step 1: Remove ProtectedRoute from Public Pages

Update `App.tsx` to remove `ProtectedRoute` wrapper from dashboard, jobs, and job detail pages. Keep `ProtectedRoute` only for admin routes.

**Routes to make public:**
- `/` (Dashboard)
- `/jobs` (Job List)
- `/jobs/:id` (Job Detail)
- `/jobs/new` (Create Job) - will need auth check in component

**Routes to keep protected:**
- `/admin` (Admin Settings - requires admin)
- `/audit` (Audit Log - requires admin)

### Step 2: Update AppLayout for Anonymous Users

Modify `AppLayout.tsx` to handle both authenticated and anonymous states:

**When logged in:**
- Show user dropdown with name and sign out option (current behavior)

**When NOT logged in:**
- Show "Sign In" button that navigates to `/login`

### Step 3: Update Dashboard for Anonymous Access

Modify `Dashboard.tsx` to:
- Show generic welcome message when not logged in ("Welcome to Sound Check")
- Use `useRecentJobs` without userId for anonymous users (show recent jobs from all users, or skip section)
- Keep all stats and navigation working

### Step 4: Protect Job Creation at Component Level

Update `CreateJob.tsx` to check authentication:
- If user is not logged in, show a message prompting them to sign in
- Redirect to login or show inline auth prompt

---

## Technical Details

### File: `src/App.tsx`

Remove `ProtectedRoute` wrapper from public routes:

```tsx
{/* Public routes - accessible without login */}
<Route path="/login" element={<Login />} />
<Route path="/register" element={<Register />} />
<Route path="/sso/callback" element={<SSOCallback />} />

{/* Main app routes - public viewing, some actions require auth */}
<Route
  path="/"
  element={
    <AppLayout>
      <Dashboard />
    </AppLayout>
  }
/>
<Route
  path="/jobs"
  element={
    <AppLayout>
      <JobList />
    </AppLayout>
  }
/>
<Route
  path="/jobs/:id"
  element={
    <AppLayout>
      <JobDetail />
    </AppLayout>
  }
/>
<Route
  path="/jobs/new"
  element={
    <AppLayout>
      <CreateJob />
    </AppLayout>
  }
/>

{/* Admin routes - require authentication + admin role */}
<Route
  path="/admin"
  element={
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <AdminSettings />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

### File: `src/components/layout/AppLayout.tsx`

Update user menu section:

```tsx
{/* User Menu / Sign In Button */}
{user ? (
  <DropdownMenu>
    {/* ... existing dropdown content ... */}
  </DropdownMenu>
) : (
  <Button variant="outline" onClick={() => navigate('/login')} className="gap-2">
    <LogIn className="h-4 w-4" />
    <span className="hidden sm:inline">Sign In</span>
  </Button>
)}
```

### File: `src/pages/Dashboard.tsx`

Update welcome message and recent jobs:

```tsx
<h1 className="text-2xl font-bold tracking-tight">
  {profile?.display_name 
    ? `Welcome back, ${profile.display_name.split(' ')[0]}`
    : 'Sound Check Dashboard'}
</h1>

{/* Recent Jobs section - show for logged-in users only, or show all recent */}
const { data: recentJobs, isLoading: recentJobsLoading } = useRecentJobs(profile?.id);
```

### File: `src/pages/CreateJob.tsx`

Add authentication check at the top:

```tsx
const { user, isLoading } = useAuthContext();

if (!isLoading && !user) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in Required</CardTitle>
        <CardDescription>
          You need to be signed in to create a monitoring job.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => navigate('/login', { state: { from: location } })}>
          Sign In to Continue
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Remove ProtectedRoute from public pages |
| `src/components/layout/AppLayout.tsx` | Add Sign In button for anonymous users |
| `src/pages/Dashboard.tsx` | Update welcome message for anonymous users |
| `src/pages/CreateJob.tsx` | Add auth check to prevent anonymous job creation |

---

## Security Considerations

- RLS policies already allow SELECT for all users - no database changes needed
- INSERT/UPDATE on jobs still requires `auth.uid()` match, so anonymous users cannot create/modify jobs
- Admin routes remain fully protected

---

## Expected Outcome

After implementation:
- Visiting the app URL shows the dashboard immediately (no redirect to login)
- Anonymous users can browse all jobs and view job details
- "Sign In" button appears in top-right corner for anonymous users
- Clicking "New Job" when not logged in shows a sign-in prompt
- Admin pages still require authentication and admin role
