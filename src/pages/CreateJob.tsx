import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2, AlertCircle, Search, Wifi, Tv, Phone, AlertTriangle, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuthContext } from '@/contexts/AuthContext';
import { isValidIpAddress, formatDurationFromMinutes, formatCadence, convertToMinutes } from '@/lib/format';
import { validateAccount, type ValidatedAccount } from '@/lib/account-validation';
import { validateDevice, type DeviceInfo } from '@/lib/device-validation';
import { useCreateJob, checkUsageLimits, checkDuplicateRunningJob } from '@/hooks/use-jobs';
import { useAdminConfig } from '@/hooks/use-admin-config';
import { createAuditLogEntry } from '@/hooks/use-audit-log';
import { startSimulator } from '@/lib/ping-simulator';

// Test account number triggers simulated mode
const TEST_ACCOUNT_NUMBER = '123456789';

// Validate account number: test accounts (9 digits starting with 1-3) or real accounts (16 digits starting with 8160)
const isValidAccountNumber = (value: string): boolean => {
  // Test account pattern: 9 digits starting with 1, 2, or 3
  if (/^[123]\d{8}$/.test(value)) return true;
  // Real account pattern: 16 digits starting with 8160
  if (/^8160\d{12}$/.test(value)) return true;
  return false;
};

const jobFormSchema = z.object({
  accountNumber: z.string()
    .min(9, 'Account number must be at least 9 digits')
    .refine(isValidAccountNumber, 'Account must be 16 digits starting with 8160, or use test account 123456789'),
  targetIp: z.string().refine(isValidIpAddress, 'Invalid IP address format'),
  targetMac: z.string().optional(), // Auto-populated from device lookup
  durationMinutes: z.number().min(1),
  cadenceSeconds: z.number().min(10),
  reason: z.enum(['reactive', 'proactive']),
  notificationEmail: z.string().email('Invalid email address'),
  alertOnOffline: z.boolean(),
  alertOnRecovery: z.boolean(),
});

type JobFormValues = z.infer<typeof jobFormSchema>;

export default function CreateJob() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { internalUser: user } = useAuthContext();
  
  // Account validation state
  const [isValidating, setIsValidating] = useState(false);
  const [accountData, setAccountData] = useState<ValidatedAccount | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [validationSource, setValidationSource] = useState<'api' | 'mock' | null>(null);
  
  // Device validation state
  const [isValidatingDevice, setIsValidatingDevice] = useState(false);
  const [deviceData, setDeviceData] = useState<DeviceInfo | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceValidationSource, setDeviceValidationSource] = useState<'api' | 'mock' | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createJobMutation = useCreateJob();
  const { data: adminConfig } = useAdminConfig();

  // Get presets from admin config or use defaults
  const durationPresetsConfig = adminConfig?.durationPresets ?? {
    presets: [
      { value: 1, unit: 'hours' as const },
      { value: 3, unit: 'hours' as const },
      { value: 6, unit: 'hours' as const },
      { value: 12, unit: 'hours' as const },
      { value: 1, unit: 'days' as const },
      { value: 2, unit: 'days' as const },
    ],
    default: 60,
  };
  // Convert preset objects to minutes for the dropdown
  const durationMinutesOptions = durationPresetsConfig.presets.map((p) => convertToMinutes(p.value, p.unit));
  const cadencePresets = adminConfig?.cadencePresets ?? {
    presets: [10, 60, 300],
    default: 60,
  };

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      accountNumber: '',
      targetIp: '',
      targetMac: '',
      durationMinutes: durationPresetsConfig.default,
      cadenceSeconds: cadencePresets.default,
      reason: 'reactive',
      notificationEmail: user?.email ?? '',
      alertOnOffline: true,
      alertOnRecovery: true,
    },
  });

  async function handleValidateAccount() {
    const accountNumber = form.getValues('accountNumber');
    if (!accountNumber || accountNumber.length < 9) {
      setAccountError('Please enter a valid account number (at least 9 digits)');
      return;
    }

    setIsValidating(true);
    setAccountError(null);
    setAccountData(null);
    setValidationSource(null);

    try {
      const result = await validateAccount(accountNumber);
      setValidationSource(result.source);
      
      if (result.success && result.account) {
        setAccountData(result.account);
        
        // Pre-fill notification email if available
        if (result.account.primaryEmail && !form.getValues('notificationEmail')) {
          form.setValue('notificationEmail', result.account.primaryEmail);
        }
        
        // Show non-blocking warning if API was unreachable but mock succeeded
        if (result.warning) {
          toast({
            title: 'Notice',
            description: result.warning,
          });
        }
      } else {
        setAccountError(result.error?.message || 'Account not found or invalid');
      }
    } catch {
      setAccountError('Failed to validate account. Please try again.');
    } finally {
      setIsValidating(false);
    }
  }

  async function handleValidateDevice() {
    const ip = form.getValues('targetIp');
    if (!ip || !isValidIpAddress(ip)) {
      // Don't show error on blur if field is empty
      if (ip) {
        setDeviceError('Please enter a valid IP address');
      }
      return;
    }

    setIsValidatingDevice(true);
    setDeviceError(null);
    setDeviceData(null);
    setDeviceValidationSource(null);

    try {
      const result = await validateDevice(ip);
      setDeviceValidationSource(result.source);
      
      if (result.success && result.device) {
        setDeviceData(result.device);
        // Auto-populate MAC in form (used for job creation)
        form.setValue('targetMac', result.device.macAddress);
      } else {
        setDeviceError(result.error?.message || 'Device not found');
        form.setValue('targetMac', '');
      }
    } catch {
      setDeviceError('Failed to fetch device information. Please try again.');
      form.setValue('targetMac', '');
    } finally {
      setIsValidatingDevice(false);
    }
  }

  async function onSubmit(data: JobFormValues) {
    if (!user) {
      toast({
        title: 'Error',
        description: 'User not found. Please refresh the page.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Check usage limits
      const limitCheck = await checkUsageLimits(user.id);
      if (!limitCheck.canCreate) {
        toast({
          title: 'Limit Exceeded',
          description: limitCheck.reason,
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      // Check for duplicate running jobs
      const targetMac = data.targetMac || null;
      const targetIp = data.targetIp || null;

      const duplicateCheck = await checkDuplicateRunningJob(targetMac, targetIp);
      if (duplicateCheck.isDuplicate) {
        toast({
          title: 'Duplicate Job Detected',
          description: `A monitoring job is already running for this ${duplicateCheck.matchType} address. View or cancel the existing job first.`,
          variant: 'destructive',
        });
        if (duplicateCheck.existingJobId) {
          navigate(`/jobs/${duplicateCheck.existingJobId}`);
        }
        setIsSubmitting(false);
        return;
      }

      // Determine monitoring mode based on account number
      const monitoringMode = data.accountNumber === TEST_ACCOUNT_NUMBER 
        ? 'simulated' 
        : 'real_polling';

      // Create the job
      const job = await createJobMutation.mutateAsync({
        account_number: data.accountNumber,
        target_mac: data.targetMac || null,
        target_ip: data.targetIp || null,
        duration_minutes: data.durationMinutes,
        cadence_seconds: data.cadenceSeconds,
        reason: data.reason,
        notification_email: data.notificationEmail,
        alert_on_offline: data.alertOnOffline,
        alert_on_recovery: data.alertOnRecovery,
        requester_id: user.id,
        requester_name: user.name,
        source: 'web_app',
        monitoring_mode: monitoringMode,
      });

      // Create audit log entry
      await createAuditLogEntry({
        action: 'job.create',
        entityType: 'job',
        entityId: job.id,
        actorId: user.id,
        actorName: user.name,
        details: {
          account_number: data.accountNumber,
          duration_minutes: data.durationMinutes,
          cadence_seconds: data.cadenceSeconds,
          reason: data.reason,
          monitoring_mode: monitoringMode,
        },
      });

      // Start the ping simulator (only for simulated mode - real_polling is handled by OpenShift pod)
      startSimulator(job.id, data.cadenceSeconds, data.durationMinutes, undefined, monitoringMode);

      toast({
        title: 'Job Created',
        description: 'Monitoring job has been started successfully.',
      });

      navigate(`/jobs/${job.id}`);
    } catch (error) {
      console.error('Failed to create job:', error);
      toast({
        title: 'Error',
        description: 'Failed to create monitoring job. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Monitoring Job</h1>
        <p className="text-muted-foreground">
          Start monitoring a modem's connectivity via ICMP ping.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Account Validation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Information</CardTitle>
              <CardDescription>
                Enter the customer account number to validate and retrieve modem details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="123456789" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleValidateAccount}
                    disabled={isValidating}
                  >
                    {isValidating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2">Validate</span>
                  </Button>
                </div>
              </div>

              {accountError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {accountError}
                </div>
              )}

              {accountData && (
                <div className="rounded-md bg-accent/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      Account Validated
                    </div>
                    <div className="flex items-center gap-1.5">
                      {accountData.accountNumber === TEST_ACCOUNT_NUMBER && (
                        <Badge variant="outline" className="text-xs gap-1 bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-300">
                          <FlaskConical className="h-3 w-3" />
                          Simulation Mode
                        </Badge>
                      )}
                      {validationSource === 'mock' && (
                        <Badge variant="outline" className="text-xs">
                          Mock Data
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Customer:</span>
                      <span className="font-medium">{accountData.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Type:</span>
                      <Badge 
                        variant={accountData.customerType.toLowerCase() === 'residential' ? 'default' : 'secondary'}
                        className="capitalize"
                        style={accountData.customerType.toLowerCase() !== 'residential' ? { backgroundColor: '#0060AE', color: 'white' } : undefined}
                      >
                        {accountData.customerType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge 
                        variant={accountData.accountStatus.toLowerCase() === 'active' ? 'default' : 'destructive'}
                        className="capitalize"
                      >
                        {accountData.accountStatus}
                      </Badge>
                    </div>
                    {accountData.serviceAddress && (
                      <div className="pt-1">
                        <span className="text-muted-foreground">Address:</span>
                        <p className="mt-0.5">{accountData.serviceAddress}</p>
                      </div>
                    )}
                    
                    {/* Services badges */}
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-muted-foreground text-xs">Services:</span>
                      <div className="flex gap-1.5">
                        {accountData.services.hsd && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Wifi className="h-3 w-3" />
                            Internet
                          </Badge>
                        )}
                        {accountData.services.video && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Tv className="h-3 w-3" />
                            Video
                          </Badge>
                        )}
                        {accountData.services.phone && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Phone className="h-3 w-3" />
                            Phone
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {accountData.nodeId && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                        <span>Node ID:</span>
                        <code className="bg-muted px-1.5 py-0.5 rounded">{accountData.nodeId}</code>
                      </div>
                    )}
                  </div>
                  
                  {/* Warning for non-active accounts */}
                  {accountData.accountStatus.toLowerCase() !== 'active' && (
                    <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 rounded p-2 mt-2">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Account is not active. Monitoring may not produce expected results.</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Target Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Target Configuration</CardTitle>
              <CardDescription>
                Enter the management IP address to identify the device and configure monitoring.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="targetIp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Management IP Address</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input 
                          placeholder="10.117.224.95" 
                          {...field} 
                          onBlur={(e) => {
                            field.onBlur();
                            if (e.target.value) {
                              handleValidateDevice();
                            }
                          }}
                        />
                      </FormControl>
                      {isValidatingDevice && (
                        <div className="flex items-center px-3">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <FormDescription>
                      Enter the modem's CM management IP address. Device info will be fetched automatically.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {deviceError && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Device Not Found</p>
                    <p className="text-xs mt-0.5">{deviceError}</p>
                  </div>
                </div>
              )}

              {deviceData && (
                <div className="rounded-md bg-accent/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      Device Found
                    </div>
                    {deviceValidationSource === 'mock' && (
                      <Badge variant="outline" className="text-xs">
                        Mock Data
                      </Badge>
                    )}
                  </div>
                  
                  <div className="text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">MAC Address:</span>
                      <code className="bg-muted px-2 py-0.5 rounded font-mono text-xs">
                        {deviceData.macAddress}
                      </code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Make:</span>
                      <span className="font-medium">{deviceData.make}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Model:</span>
                      <span className="font-medium">{deviceData.model}</span>
                    </div>
                    {deviceData.docsisVersion && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">DOCSIS:</span>
                        <Badge variant="secondary" className="text-xs">
                          {deviceData.docsisVersion}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v))}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select duration" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover">
                          {durationMinutesOptions.map((minutes) => (
                            <SelectItem key={minutes} value={minutes.toString()}>
                              {formatDurationFromMinutes(minutes)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cadenceSeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ping Cadence</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v))}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select cadence" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover">
                          {cadencePresets.presets.map((seconds) => (
                            <SelectItem key={seconds} value={seconds.toString()}>
                              {formatCadence(seconds)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Monitoring</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select reason" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover">
                        <SelectItem value="reactive">Reactive - Customer reported issue</SelectItem>
                        <SelectItem value="proactive">Proactive - Preventive monitoring</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notifications & Alerts</CardTitle>
              <CardDescription>
                Configure email notifications and alert preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="notificationEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notification Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormDescription>
                      Completion report will be sent to this email
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <Label>Alert Preferences</Label>
                <FormField
                  control={form.control}
                  name="alertOnOffline"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-normal">
                          Alert when modem goes offline
                        </FormLabel>
                        <FormDescription>
                          Triggered after 5 consecutive missed pings
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="alertOnRecovery"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-normal">
                          Notify when modem recovers
                        </FormLabel>
                        <FormDescription>
                          Triggered after 5 consecutive successful pings following an outage
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate('/')}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Start Monitoring
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
