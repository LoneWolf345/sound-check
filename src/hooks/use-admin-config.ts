import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AdminConfig, DurationPresetsConfig, CadencePresetsConfig, ThresholdsConfig, UsageLimitsConfig, WebhookConfig, DurationPreset } from '@/types';
import type { Json } from '@/integrations/supabase/types';
import { findBestUnit } from '@/lib/format';

// Default configurations
const DEFAULT_DURATION_PRESETS: DurationPresetsConfig = {
  presets: [
    { value: 1, unit: 'hours' },
    { value: 3, unit: 'hours' },
    { value: 6, unit: 'hours' },
    { value: 12, unit: 'hours' },
    { value: 1, unit: 'days' },
    { value: 2, unit: 'days' },
  ],
  default: 60,
};

// Migrate old format (array of numbers) to new format (array of objects)
function migrateDurationPresets(config: unknown): DurationPresetsConfig {
  if (!config || typeof config !== 'object') return DEFAULT_DURATION_PRESETS;
  
  const cfg = config as { presets?: unknown; default?: number };
  
  if (Array.isArray(cfg.presets) && cfg.presets.length > 0) {
    // Check if it's old format (array of numbers)
    if (typeof cfg.presets[0] === 'number') {
      return {
        presets: (cfg.presets as number[]).map((m) => findBestUnit(m)),
        default: cfg.default ?? 60,
      };
    }
    // Already new format
    return cfg as DurationPresetsConfig;
  }
  
  return DEFAULT_DURATION_PRESETS;
}

const DEFAULT_CADENCE_PRESETS: CadencePresetsConfig = {
  presets: [10, 60, 300],
  default: 60,
};

const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  packet_loss_percent: 2,
  p95_latency_ms: 100,
  system_error_percent: 5,
};

const DEFAULT_USAGE_LIMITS: UsageLimitsConfig = {
  jobs_per_user_per_day: 50,
  max_running_jobs: 100,
};

const DEFAULT_WEBHOOK: WebhookConfig = {
  endpoint: null,
  secret: null,
};

type ConfigKey = 'duration_presets' | 'cadence_presets' | 'thresholds' | 'usage_limits' | 'webhook_config';

type ConfigValueMap = {
  duration_presets: DurationPresetsConfig;
  cadence_presets: CadencePresetsConfig;
  thresholds: ThresholdsConfig;
  usage_limits: UsageLimitsConfig;
  webhook_config: WebhookConfig;
};

const DEFAULT_VALUES: ConfigValueMap = {
  duration_presets: DEFAULT_DURATION_PRESETS,
  cadence_presets: DEFAULT_CADENCE_PRESETS,
  thresholds: DEFAULT_THRESHOLDS,
  usage_limits: DEFAULT_USAGE_LIMITS,
  webhook_config: DEFAULT_WEBHOOK,
};

// Fetch all admin configuration
export function useAdminConfig() {
  return useQuery({
    queryKey: ['admin-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_config')
        .select('*');
      if (error) throw error;

      // Convert array to a keyed object for easy access
      const configMap: Partial<Record<ConfigKey, AdminConfig>> = {};
      for (const item of data) {
        configMap[item.key as ConfigKey] = item as AdminConfig;
      }

      return {
        durationPresets: migrateDurationPresets(configMap.duration_presets?.value),
        cadencePresets: (configMap.cadence_presets?.value as unknown as CadencePresetsConfig) ?? DEFAULT_CADENCE_PRESETS,
        thresholds: (configMap.thresholds?.value as unknown as ThresholdsConfig) ?? DEFAULT_THRESHOLDS,
        usageLimits: (configMap.usage_limits?.value as unknown as UsageLimitsConfig) ?? DEFAULT_USAGE_LIMITS,
        webhook: (configMap.webhook_config?.value as unknown as WebhookConfig) ?? DEFAULT_WEBHOOK,
        raw: configMap,
      };
    },
  });
}

// Fetch a single config value
export function useConfigValue<K extends ConfigKey>(key: K) {
  const { data: config, ...rest } = useAdminConfig();

  const keyMap: Record<ConfigKey, keyof NonNullable<typeof config>> = {
    duration_presets: 'durationPresets',
    cadence_presets: 'cadencePresets',
    thresholds: 'thresholds',
    usage_limits: 'usageLimits',
    webhook_config: 'webhook',
  };

  return {
    data: config?.[keyMap[key]] as ConfigValueMap[K] | undefined ?? DEFAULT_VALUES[key],
    ...rest,
  };
}

// Update a config value
export function useUpdateAdminConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value, updatedBy }: { key: ConfigKey; value: ConfigValueMap[ConfigKey]; updatedBy?: string }) => {
      // Check if config exists
      const { data: existing } = await supabase
        .from('admin_config')
        .select('id')
        .eq('key', key)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('admin_config')
          .update({
            value: value as unknown as Json,
            updated_by: updatedBy ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('key', key)
          .select();
        if (error) throw error;
        return data?.[0] ?? null;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('admin_config')
          .insert({
            key,
            value: value as unknown as Json,
            updated_by: updatedBy ?? null,
          })
          .select();
        if (error) throw error;
        return data?.[0] ?? null;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-config'] });
    },
  });
}
