import { useAuthContext } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Settings, Clock, Activity, Gauge, Users, Save, Loader2, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAdminConfig, useUpdateAdminConfig } from '@/hooks/use-admin-config';
import { createAuditLogEntry } from '@/hooks/use-audit-log';
import { DurationPresetEditor } from '@/components/admin/DurationPresetEditor';
import { UserManagement } from '@/components/admin/UserManagement';
import type { DurationPresetsConfig, CadencePresetsConfig, ThresholdsConfig, UsageLimitsConfig, WebhookConfig, DurationPreset } from '@/types';

export default function AdminSettings() {
  const { isAdmin, user, profile } = useAuthContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: config, isLoading } = useAdminConfig();
  const updateConfigMutation = useUpdateAdminConfig();

  // Local form state
  const [durationPresets, setDurationPresets] = useState<DurationPresetsConfig>({
    presets: [
      { value: 1, unit: 'hours' },
      { value: 3, unit: 'hours' },
      { value: 6, unit: 'hours' },
      { value: 12, unit: 'hours' },
      { value: 1, unit: 'days' },
      { value: 2, unit: 'days' },
    ],
    default: 60,
  });
  const [cadencePresets, setCadencePresets] = useState<CadencePresetsConfig>({
    presets: [10, 60, 300],
    default: 60,
  });
  const [thresholds, setThresholds] = useState<ThresholdsConfig>({
    packet_loss_percent: 2,
    p95_latency_ms: 100,
    system_error_percent: 5,
  });
  const [usageLimits, setUsageLimits] = useState<UsageLimitsConfig>({
    jobs_per_user_per_day: 50,
    max_running_jobs: 100,
  });
  const [webhook, setWebhook] = useState<WebhookConfig>({
    endpoint: null,
    secret: null,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Update local state when config loads
  useEffect(() => {
    if (config) {
      setDurationPresets(config.durationPresets);
      setCadencePresets(config.cadencePresets);
      setThresholds(config.thresholds);
      setUsageLimits(config.usageLimits);
      setWebhook(config.webhook);
    }
  }, [config]);

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  async function handleSave() {
    if (!user) return;

    setIsSaving(true);
    try {
      // Save all config values
      await Promise.all([
        updateConfigMutation.mutateAsync({
          key: 'duration_presets',
          value: durationPresets,
          updatedBy: user!.id,
        }),
        updateConfigMutation.mutateAsync({
          key: 'cadence_presets',
          value: cadencePresets,
          updatedBy: user!.id,
        }),
        updateConfigMutation.mutateAsync({
          key: 'thresholds',
          value: thresholds,
          updatedBy: user!.id,
        }),
        updateConfigMutation.mutateAsync({
          key: 'usage_limits',
          value: usageLimits,
          updatedBy: user!.id,
        }),
        updateConfigMutation.mutateAsync({
          key: 'webhook_config',
          value: webhook,
          updatedBy: user!.id,
        }),
      ]);

      // Create audit log entry
      await createAuditLogEntry({
        action: 'admin.config.change',
        entityType: 'admin_config',
        actorId: user!.id,
        actorName: profile?.display_name || user!.email || 'Unknown',
        details: {
          before: config,
          after: { durationPresets, cadencePresets, thresholds, usageLimits, webhook },
        },
      });

      toast({
        title: 'Settings Saved',
        description: 'Admin configuration has been updated.',
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Settings</h1>
        <p className="text-muted-foreground">
          Configure presets, thresholds, usage limits, and manage users.
        </p>
      </div>

      {/* User Management */}
      <UserManagement />

      {/* Duration Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Duration Presets
          </CardTitle>
          <CardDescription>
            Configure the available monitoring duration options.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {durationPresets.presets.map((preset, index) => (
              <DurationPresetEditor
                key={index}
                preset={preset}
                onChange={(newPreset) => {
                  const newPresets = [...durationPresets.presets];
                  newPresets[index] = newPreset;
                  setDurationPresets({ ...durationPresets, presets: newPresets });
                }}
                onDelete={() => {
                  const newPresets = durationPresets.presets.filter((_, i) => i !== index);
                  setDurationPresets({ ...durationPresets, presets: newPresets });
                }}
                canDelete={durationPresets.presets.length > 1}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDurationPresets({
                ...durationPresets,
                presets: [...durationPresets.presets, { value: 1, unit: 'hours' }],
              });
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Duration Preset
          </Button>
          <Separator />
          <div className="flex items-center gap-2">
            <Label>Default:</Label>
            <Input
              type="number"
              value={durationPresets.default}
              onChange={(e) => setDurationPresets({ ...durationPresets, default: parseInt(e.target.value) || 60 })}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">minutes</span>
          </div>
        </CardContent>
      </Card>

      {/* Cadence Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Cadence Presets
          </CardTitle>
          <CardDescription>
            Configure the available ping interval options.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {cadencePresets.presets.map((seconds, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="number"
                  value={seconds}
                  onChange={(e) => {
                    const newPresets = [...cadencePresets.presets];
                    newPresets[index] = parseInt(e.target.value) || 0;
                    setCadencePresets({ ...cadencePresets, presets: newPresets });
                  }}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label>Default:</Label>
            <Input
              type="number"
              value={cadencePresets.default}
              onChange={(e) => setCadencePresets({ ...cadencePresets, default: parseInt(e.target.value) || 60 })}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">seconds</span>
          </div>
        </CardContent>
      </Card>

      {/* Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Pass/Fail Thresholds
          </CardTitle>
          <CardDescription>
            Configure the thresholds for pass/fail evaluation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Packet Loss Threshold (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={thresholds.packet_loss_percent}
                  onChange={(e) => setThresholds({ ...thresholds, packet_loss_percent: parseFloat(e.target.value) || 0 })}
                  step={0.1}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">% (PASS if ≤)</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>p95 Latency Threshold (ms)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={thresholds.p95_latency_ms}
                  onChange={(e) => setThresholds({ ...thresholds, p95_latency_ms: parseInt(e.target.value) || 0 })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">ms (PASS if ≤)</span>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>System Error Note Threshold (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={thresholds.system_error_percent}
                onChange={(e) => setThresholds({ ...thresholds, system_error_percent: parseFloat(e.target.value) || 0 })}
                step={0.1}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                % (show note in email if system errors exceed this)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Usage Limits
          </CardTitle>
          <CardDescription>
            Configure limits to prevent system overload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Jobs Per User Per Day</Label>
              <Input
                type="number"
                value={usageLimits.jobs_per_user_per_day}
                onChange={(e) => setUsageLimits({ ...usageLimits, jobs_per_user_per_day: parseInt(e.target.value) || 0 })}
                className="w-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Maximum Running Jobs (Global)</Label>
              <Input
                type="number"
                value={usageLimits.max_running_jobs}
                onChange={(e) => setUsageLimits({ ...usageLimits, max_running_jobs: parseInt(e.target.value) || 0 })}
                className="w-32"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            TeMPO Webhook Configuration
          </CardTitle>
          <CardDescription>
            Configure the global webhook endpoint for TeMPO integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook Endpoint URL</Label>
            <Input
              type="url"
              placeholder="https://tempo.company.com/webhooks/modem-monitor"
              value={webhook.endpoint ?? ''}
              onChange={(e) => setWebhook({ ...webhook, endpoint: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label>Webhook Secret (HMAC)</Label>
            <Input
              type="password"
              placeholder="Enter secret for webhook signing"
              value={webhook.secret ?? ''}
              onChange={(e) => setWebhook({ ...webhook, secret: e.target.value || null })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button className="gap-2" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
