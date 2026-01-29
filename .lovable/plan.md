

# Authentication System Implementation

## Current State Analysis

The app currently has:
- A hardcoded `INTERNAL_USERS` list in `use-auth.ts` with a shared password (`soundcheck-internal-2024`)
- A user switcher dropdown that allows any visitor to "switch" between predefined internal users
- A `user_roles` table already exists with `app_role` enum (`admin` | `user`)
- A `has_role()` database function for checking roles securely
- No login/registration UI - anyone can access all non-admin features immediately

## Goal

Transform the authentication system to:
1. **Require authentication** - users must sign in to use the app
2. **Support registration** - new users can create accounts (assigned `user` role by default)
3. **Admin role management** - admins can elevate users or revoke admin status
4. **SSO-ready** - include non-functional stubs for future SSO integration (SAML/OAuth)

## Architecture Overview

```text
+------------------+     +------------------+     +------------------+
|   Login Page     |     |  Register Page   |     |   SSO Callback   |
|  (email/pass)    |     |  (email/pass)    |     |   (stub/future)  |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                                  v
                        +------------------+
                        |   AuthProvider   |
                        | (checks session) |
                        +--------+---------+
                                 |
            +--------------------+--------------------+
            |                                         |
            v                                         v
    +---------------+                         +---------------+
    | Authenticated |                         |  Unauthenticated
    |   (has user)  |                         |  (redirect to /login)
    +-------+-------+                         +---------------+
            |
            v
    +---------------+
    |   AppLayout   |
    | (main routes) |
    +---------------+
```

## Database Changes

### 1. Create `profiles` table

Store additional user information (display name) that's not in `auth.users`:

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read all profiles (needed for admin user list)
CREATE POLICY "Users can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- System can insert profiles (trigger)
CREATE POLICY "System can insert profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
```

### 2. Create trigger to auto-create profile and assign default role on signup

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 3. Add RLS policy for admins to view all users

Already exists via the `has_role()` function pattern.

## New Files

| File | Purpose |
|------|---------|
| `src/pages/Login.tsx` | Login form with email/password + SSO button (stub) |
| `src/pages/Register.tsx` | Registration form |
| `src/pages/SSOCallback.tsx` | Placeholder for future SSO redirect handling |
| `src/components/auth/ProtectedRoute.tsx` | Wrapper to require authentication |
| `src/components/admin/UserManagement.tsx` | Admin panel for viewing users and managing roles |

## Modified Files

| File | Changes |
|------|---------|
| `src/App.tsx` | Add login/register routes, wrap main routes with ProtectedRoute |
| `src/hooks/use-auth.ts` | Remove hardcoded users, add proper signIn/signUp, fetch profile |
| `src/contexts/AuthContext.tsx` | Expose signIn/signUp/profile, remove mock user switcher |
| `src/components/layout/AppLayout.tsx` | Replace user switcher with sign out button + user name |
| `src/pages/AdminSettings.tsx` | Add User Management section |

## Implementation Details

### Login Page (`src/pages/Login.tsx`)

- Email + password form
- "Sign In" button
- Link to Register page
- "Sign in with SSO" button (disabled/stub with tooltip: "Coming soon")
- Error handling for invalid credentials

### Register Page (`src/pages/Register.tsx`)

- Email + password + confirm password + display name form
- "Create Account" button
- Link to Login page
- On success: auto-sign in and redirect to dashboard
- Trigger creates profile + assigns `user` role automatically

### Protected Route Component

```tsx
// Wraps routes that require authentication
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuthContext();
  
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  
  return children;
}
```

### SSO Callback Page (Stub)

```tsx
// Placeholder for future SAML/OAuth callback handling
export default function SSOCallback() {
  // Future: Parse OAuth code, exchange for tokens, redirect
  return (
    <div>
      <h1>SSO Authentication</h1>
      <p>This feature is coming soon.</p>
      <Link to="/login">Return to Login</Link>
    </div>
  );
}
```

### User Management (Admin)

Add a new card to AdminSettings or a separate admin page:

- List all users (from profiles table + user_roles)
- Show role badges (Admin/User)
- "Make Admin" / "Remove Admin" buttons (only visible to admins)
- Audit log entry on role changes

### AppLayout Header Changes

Replace the current user switcher dropdown with:
- Logged-in user's display name
- Admin badge (if applicable)
- Sign Out button

## Route Structure

```text
/login          → Login page (public)
/register       → Register page (public)
/sso/callback   → SSO callback stub (public)

/               → Dashboard (protected)
/jobs/new       → Create Job (protected)
/jobs           → Job List (protected)
/jobs/:id       → Job Detail (protected)
/admin          → Admin Settings (protected + admin only)
/audit          → Audit Log (protected + admin only)
```

## Auth Flow

1. **First visit (unauthenticated)**: Redirect to `/login`
2. **Login**: Enter credentials → Supabase Auth → Success → Redirect to `/`
3. **Register**: Fill form → Supabase Auth signUp → Trigger creates profile + role → Auto sign-in → Redirect to `/`
4. **Sign Out**: Clear session → Redirect to `/login`
5. **SSO (future)**: Click SSO button → Redirect to IdP → Callback → Create/link account → Redirect to `/`

## Technical Notes

- Auto-confirm emails will be enabled (internal tool, no email verification needed)
- Remove the hardcoded `INTERNAL_USERS` array and `INTERNAL_PASSWORD`
- The existing `has_role()` function continues to be used for admin checks
- Profile display name is stored separately from Supabase's `auth.users.email`
- SSO stubs use placeholder functions that log "SSO not configured" and show user-friendly messages

