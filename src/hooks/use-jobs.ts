import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Job, Sample, JobStatus } from '@/types';
import type { TablesInsert } from '@/integrations/supabase/types';

// Fetch all jobs with optional filters
export function useJobs(options?: { status?: JobStatus | 'all'; search?: string }) {
  return useQuery({
    queryKey: ['jobs', options?.status, options?.search],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (options?.status && options.status !== 'all') {
        query = query.eq('status', options.status);
      }

      if (options?.search) {
        const searchTerm = `%${options.search}%`;
        query = query.or(
          `account_number.ilike.${searchTerm},target_mac.ilike.${searchTerm},target_ip.ilike.${searchTerm},id.ilike.${searchTerm}`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Job[];
    },
  });
}

// Fetch a single job by ID
export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as Job | null;
    },
    enabled: !!id,
  });
}

// Fetch samples for a job
export function useJobSamples(jobId: string | undefined) {
  return useQuery({
    queryKey: ['samples', jobId],
    queryFn: async () => {
      if (!jobId) return [];
      const { data, error } = await supabase
        .from('samples')
        .select('*')
        .eq('job_id', jobId)
        .order('sequence_number', { ascending: true });
      if (error) throw error;
      return data as Sample[];
    },
    enabled: !!jobId,
  });
}

// Fetch dashboard statistics
export function useJobStats() {
  return useQuery({
    queryKey: ['job-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      // Fetch multiple stats in parallel
      const [runningResult, completedTodayResult, alertsTodayResult] = await Promise.all([
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('completed_at', todayIso),
        supabase.from('alerts').select('id', { count: 'exact', head: true }).gte('triggered_at', todayIso),
      ]);

      return {
        runningJobs: runningResult.count ?? 0,
        completedToday: completedTodayResult.count ?? 0,
        alertsTriggered: alertsTodayResult.count ?? 0,
        avgPacketLoss: 0, // Will be calculated from samples if needed
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

// Fetch recent jobs for current user
export function useRecentJobs(userId: string | undefined, limit = 5) {
  return useQuery({
    queryKey: ['recent-jobs', userId, limit],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Job[];
    },
    enabled: !!userId,
  });
}

// Check usage limits before creating a job
export async function checkUsageLimits(userId: string): Promise<{ canCreate: boolean; reason?: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [userJobsResult, runningJobsResult] = await Promise.all([
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', userId)
      .gte('created_at', todayIso),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running'),
  ]);

  const userJobsToday = userJobsResult.count ?? 0;
  const runningJobs = runningJobsResult.count ?? 0;

  // Default limits - will be fetched from admin_config later
  const maxJobsPerUserPerDay = 50;
  const maxRunningJobs = 100;

  if (userJobsToday >= maxJobsPerUserPerDay) {
    return { canCreate: false, reason: `You have reached your daily limit of ${maxJobsPerUserPerDay} jobs.` };
  }

  if (runningJobs >= maxRunningJobs) {
    return { canCreate: false, reason: `System limit reached: ${maxRunningJobs} jobs are currently running.` };
  }

  return { canCreate: true };
}

// Create a new job
export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobData: TablesInsert<'jobs'>) => {
      const { data, error } = await supabase
        .from('jobs')
        .insert(jobData)
        .select()
        .single();
      if (error) throw error;
      return data as Job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job-stats'] });
      queryClient.invalidateQueries({ queryKey: ['recent-jobs'] });
    },
  });
}

// Cancel a running job
export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase
        .from('jobs')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .select()
        .single();
      if (error) throw error;
      return data as Job;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job', data.id] });
      queryClient.invalidateQueries({ queryKey: ['job-stats'] });
    },
  });
}

// Complete a job
export function useCompleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase
        .from('jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .select()
        .single();
      if (error) throw error;
      return data as Job;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job', data.id] });
      queryClient.invalidateQueries({ queryKey: ['job-stats'] });
    },
  });
}
