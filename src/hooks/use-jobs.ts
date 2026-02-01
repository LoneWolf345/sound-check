import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Job, Sample, JobStatus } from '@/types';
import type { TablesInsert } from '@/integrations/supabase/types';

// Response type for paginated queries
interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Fetch all jobs with optional filters and pagination
export function useJobs(options?: { 
  status?: JobStatus | 'all'; 
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = options?.page ?? 1;
  const pageSize = Math.min(options?.pageSize ?? 50, 100); // Cap at 100
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: ['jobs', options?.status, options?.search, page, pageSize],
    queryFn: async (): Promise<PaginatedResult<Job>> => {
      let query = supabase
        .from('jobs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (options?.status && options.status !== 'all') {
        query = query.eq('status', options.status);
      }

      if (options?.search) {
        const searchTerm = `%${options.search}%`;
        query = query.or(
          `account_number.ilike.${searchTerm},target_mac.ilike.${searchTerm},target_ip.ilike.${searchTerm},id.ilike.${searchTerm}`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      
      const total = count ?? 0;
      return {
        data: data as Job[],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
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

// Fetch samples for a job with windowed loading (default 500 most recent)
export function useJobSamples(jobId: string | undefined, options?: { limit?: number }) {
  const limit = Math.min(options?.limit ?? 500, 1000); // Cap at 1000 samples
  
  return useQuery({
    queryKey: ['samples', jobId, limit],
    queryFn: async () => {
      if (!jobId) return [];
      const { data, error } = await supabase
        .from('samples')
        .select('*')
        .eq('job_id', jobId)
        .order('sequence_number', { ascending: false })
        .limit(limit);
      if (error) throw error;
      // Reverse to get chronological order for charts
      return (data as Sample[]).reverse();
    },
    enabled: !!jobId,
  });
}

// Fetch samples with pagination and total count
export function useJobSamplesWindowed(
  jobId: string | undefined,
  options?: { limit?: number; offset?: number }
) {
  const limit = options?.limit ?? 500;
  const offset = options?.offset ?? 0;
  
  return useQuery({
    queryKey: ['samples-windowed', jobId, limit, offset],
    queryFn: async () => {
      if (!jobId) return { samples: [], total: 0 };
      
      const { data, count, error } = await supabase
        .from('samples')
        .select('*', { count: 'exact' })
        .eq('job_id', jobId)
        .order('sequence_number', { ascending: false })
        .range(offset, offset + limit - 1);
        
      if (error) throw error;
      return { 
        samples: (data as Sample[]).reverse(), 
        total: count ?? 0 
      };
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
  const maxRunningJobs = 5000; // Updated for scale

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

// Normalize MAC address for consistent comparison
function normalizeMac(mac: string): string {
  return mac.replace(/[:-]/g, '').toUpperCase();
}

// Check for duplicate running jobs by target MAC or IP
export async function checkDuplicateRunningJob(
  targetMac: string | null,
  targetIp: string | null
): Promise<{ isDuplicate: boolean; existingJobId?: string; matchType?: 'MAC' | 'IP' }> {
  // Check MAC if provided
  if (targetMac) {
    const normalizedMac = normalizeMac(targetMac);
    const { data: runningJobs } = await supabase
      .from('jobs')
      .select('id, target_mac')
      .eq('status', 'running');
    
    if (runningJobs) {
      const matchingJob = runningJobs.find(
        (job) => job.target_mac && normalizeMac(job.target_mac) === normalizedMac
      );
      if (matchingJob) {
        return { isDuplicate: true, existingJobId: matchingJob.id, matchType: 'MAC' };
      }
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
