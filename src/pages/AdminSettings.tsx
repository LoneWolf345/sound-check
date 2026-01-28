import { useUser } from '@/contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Settings, Clock, Activity, Gauge, Users, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function AdminSettings() {
  const { isAdmin } = useUser();
  const navigate = useNavigate();

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Settings</h1>
        <p className="text-muted-foreground">
          Configure presets, thresholds, and usage limits.
        </p>
      </div>

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
          <div className="grid gap-4 sm:grid-cols-3">
            {[60, 180, 360, 720, 1440, 2880].map((minutes) => (
              <div key={minutes} className="flex items-center gap-2">
                <Input
                  type="number"
                  defaultValue={minutes}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label>Default:</Label>
            <Input type="number" defaultValue={60} className="w-24" />
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
            {[10, 60, 300].map((seconds) => (
              <div key={seconds} className="flex items-center gap-2">
                <Input
                  type="number"
                  defaultValue={seconds}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label>Default:</Label>
            <Input type="number" defaultValue={60} className="w-24" />
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
                <Input type="number" defaultValue={2} step={0.1} className="w-24" />
                <span className="text-sm text-muted-foreground">% (PASS if ≤)</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>p95 Latency Threshold (ms)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" defaultValue={100} className="w-24" />
                <span className="text-sm text-muted-foreground">ms (PASS if ≤)</span>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>System Error Note Threshold (%)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" defaultValue={5} step={0.1} className="w-24" />
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
              <Input type="number" defaultValue={50} className="w-32" />
            </div>
            <div className="space-y-2">
              <Label>Maximum Running Jobs (Global)</Label>
              <Input type="number" defaultValue={100} className="w-32" />
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
            <Input type="url" placeholder="https://tempo.company.com/webhooks/modem-monitor" />
          </div>
          <div className="space-y-2">
            <Label>Webhook Secret (HMAC)</Label>
            <Input type="password" placeholder="Enter secret for webhook signing" />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button className="gap-2">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
