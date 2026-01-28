-- Allow authenticated users to insert their own admin role (for auto-setup during user switching)
-- The existing RLS policies already allow admins to manage roles, but we need to allow
-- the initial admin role setup when a new user is created

-- First, drop the existing restrictive policy that requires admin
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Create a policy that allows users to insert their own role (for initial setup)
CREATE POLICY "Users can insert their own role"
ON public.user_roles FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Create a policy that allows admins to manage all roles (update/delete)
CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));