import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Alert } from '@/types';

// Fetch alerts for a specific job
export function useJobAlerts(jobId: string | undefined) {
  return useQuery({
    queryKey: ['alerts', jobId],
    queryFn: async () => {
      if (!jobId) return [];
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('job_id', jobId)
        .order('triggered_at', { ascending: true });
      if (error) throw error;
      return data as Alert[];
    },
    enabled: !!jobId,
  });
}
