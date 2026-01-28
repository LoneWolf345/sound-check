import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AuditLog } from '@/types';
import type { Json } from '@/integrations/supabase/types';

// Fetch audit logs with pagination
export function useAuditLogs(options?: { page?: number; pageSize?: number; action?: string }) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: ['audit-logs', page, pageSize, options?.action],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (options?.action) {
        query = query.eq('action', options.action);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        logs: data as AuditLog[],
        totalCount: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    },
  });
}

// Create an audit log entry
export function useCreateAuditLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: {
      action: string;
      entityType: string;
      entityId?: string;
      actorId?: string;
      actorName?: string;
      details?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from('audit_logs')
        .insert({
          action: entry.action,
          entity_type: entry.entityType,
          entity_id: entry.entityId ?? null,
          actor_id: entry.actorId ?? null,
          actor_name: entry.actorName ?? null,
          details: (entry.details ?? null) as unknown as Json,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AuditLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// Utility function to create audit log (can be called without hook)
export async function createAuditLogEntry(entry: {
  action: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  actorName?: string;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      actor_id: entry.actorId ?? null,
      actor_name: entry.actorName ?? null,
      details: (entry.details ?? null) as unknown as Json,
    });
  if (error) {
    console.error('Failed to create audit log:', error);
  }
}
