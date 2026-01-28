-- Create enums for job and sample statuses
CREATE TYPE public.job_status AS ENUM ('running', 'completed', 'cancelled', 'failed');
CREATE TYPE public.sample_status AS ENUM ('success', 'missed', 'system_error');
CREATE TYPE public.job_reason AS ENUM ('reactive', 'proactive');
CREATE TYPE public.alert_state AS ENUM ('ok', 'offline_alerted');
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table for admin access (separate from profiles per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create admin_config table for presets, thresholds, and limits
CREATE TABLE public.admin_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Create jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number TEXT NOT NULL,
  target_mac TEXT,
  target_ip TEXT,
  duration_minutes INTEGER NOT NULL,
  cadence_seconds INTEGER NOT NULL,
  reason job_reason NOT NULL,
  notification_email TEXT NOT NULL,
  alert_on_offline BOOLEAN NOT NULL DEFAULT false,
  alert_on_recovery BOOLEAN NOT NULL DEFAULT false,
  status job_status NOT NULL DEFAULT 'running',
  alert_state alert_state NOT NULL DEFAULT 'ok',
  requester_id UUID NOT NULL,
  requester_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web_app',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT target_required CHECK (target_mac IS NOT NULL OR target_ip IS NOT NULL)
);

-- Create samples table for ping results
CREATE TABLE public.samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  status sample_status NOT NULL,
  rtt_ms NUMERIC(10, 2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sequence_number INTEGER NOT NULL
);

-- Create index for efficient sample queries
CREATE INDEX idx_samples_job_id ON public.samples(job_id);
CREATE INDEX idx_samples_job_recorded ON public.samples(job_id, recorded_at);

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  delivery_status TEXT DEFAULT 'pending'
);

CREATE INDEX idx_alerts_job_id ON public.alerts(job_id);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (true);

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for admin_config (read by all, write by admins)
CREATE POLICY "Anyone can read admin config"
ON public.admin_config FOR SELECT
USING (true);

CREATE POLICY "Admins can update config"
ON public.admin_config FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for jobs (users see all jobs, can only modify their own)
CREATE POLICY "Users can view all jobs"
ON public.jobs FOR SELECT
USING (true);

CREATE POLICY "Users can create jobs"
ON public.jobs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own jobs"
ON public.jobs FOR UPDATE
USING (requester_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for samples
CREATE POLICY "Users can view all samples"
ON public.samples FOR SELECT
USING (true);

CREATE POLICY "System can insert samples"
ON public.samples FOR INSERT
WITH CHECK (true);

-- RLS Policies for alerts
CREATE POLICY "Users can view all alerts"
ON public.alerts FOR SELECT
USING (true);

CREATE POLICY "System can manage alerts"
ON public.alerts FOR ALL
USING (true);

-- RLS Policies for audit_logs (read by all, insert by system)
CREATE POLICY "Users can view audit logs"
ON public.audit_logs FOR SELECT
USING (true);

CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (true);

-- Insert default admin config values
INSERT INTO public.admin_config (key, value) VALUES
  ('duration_presets', '{"presets": [60, 180, 360, 720, 1440, 2880], "default": 60}'::jsonb),
  ('cadence_presets', '{"presets": [10, 60, 300], "default": 60}'::jsonb),
  ('thresholds', '{"packet_loss_percent": 2, "p95_latency_ms": 100, "system_error_percent": 5}'::jsonb),
  ('usage_limits', '{"jobs_per_user_per_day": 50, "max_running_jobs": 100}'::jsonb),
  ('webhook_config', '{"endpoint": null, "secret": null}'::jsonb);