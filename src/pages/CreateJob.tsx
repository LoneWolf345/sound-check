import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useUser } from '@/contexts/UserContext';
import { isValidMacAddress, isValidIpAddress, formatDurationFromMinutes, formatCadence } from '@/lib/format';
import { mockValidateAccount, type MockBillingAccount } from '@/lib/mock-data';

const jobFormSchema = z.object({
  accountNumber: z.string().min(9, 'Account number must be at least 9 digits').max(12),
  targetType: z.enum(['mac', 'ip']),
  targetMac: z.string().optional(),
  targetIp: z.string().optional(),
  durationMinutes: z.number().min(1),
  cadenceSeconds: z.number().min(10),
  reason: z.enum(['reactive', 'proactive']),
  notificationEmail: z.string().email('Invalid email address'),
  alertOnOffline: z.boolean(),
  alertOnRecovery: z.boolean(),
}).refine((data) => {
  if (data.targetType === 'mac') {
    return data.targetMac && isValidMacAddress(data.targetMac);
  } else {
    return data.targetIp && isValidIpAddress(data.targetIp);
  }
}, {
  message: 'Please enter a valid MAC address or IP address',
  path: ['targetMac'],
});

type JobFormValues = z.infer<typeof jobFormSchema>;

// Preset options (will come from admin config later)
const DURATION_PRESETS = [
  { value: 60, label: '1 hour' },
  { value: 180, label: '3 hours' },
  { value: 360, label: '6 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '1 day' },
  { value: 2880, label: '2 days' },
];

const CADENCE_PRESETS = [
  { value: 10, label: '10 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
];

export default function CreateJob() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUser();
  const [isValidating, setIsValidating] = useState(false);
  const [accountData, setAccountData] = useState<MockBillingAccount | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      accountNumber: '',
      targetType: 'mac',
      targetMac: '',
      targetIp: '',
      durationMinutes: 60,
      cadenceSeconds: 60,
      reason: 'reactive',
      notificationEmail: user?.email ?? '',
      alertOnOffline: true,
      alertOnRecovery: true,
    },
  });

  const watchTargetType = form.watch('targetType');

  async function validateAccount() {
    const accountNumber = form.getValues('accountNumber');
    if (!accountNumber || accountNumber.length < 9) {
      setAccountError('Please enter a valid account number');
      return;
    }

    setIsValidating(true);
    setAccountError(null);
    setAccountData(null);

    try {
      const result = await mockValidateAccount(accountNumber);
      if (result) {
        setAccountData(result);
        // Auto-fill modem data if available
        if (result.modems.length > 0) {
          form.setValue('targetMac', result.modems[0].macAddress);
          form.setValue('targetIp', result.modems[0].managementIp);
        }
      } else {
        setAccountError('Account not found or invalid');
      }
    } catch {
      setAccountError('Failed to validate account');
    } finally {
      setIsValidating(false);
    }
  }

  async function onSubmit(data: JobFormValues) {
    // TODO: Implement actual job creation via Supabase
    console.log('Creating job:', data);
    
    toast({
      title: 'Job Created',
      description: 'Monitoring job has been started successfully.',
    });
    
    navigate('/jobs');
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
                    onClick={validateAccount}
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
                <div className="rounded-md bg-accent/50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    Account Validated
                  </div>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Customer:</span> {accountData.customerName}</p>
                    <p><span className="text-muted-foreground">Address:</span> {accountData.serviceAddress}</p>
                    {accountData.modems.length > 0 && (
                      <p>
                        <span className="text-muted-foreground">Modem:</span>{' '}
                        {accountData.modems[0].model} ({accountData.modems[0].status})
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Target Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Target Configuration</CardTitle>
              <CardDescription>
                Specify the modem identifier and monitoring parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select target type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover">
                        <SelectItem value="mac">MAC Address</SelectItem>
                        <SelectItem value="ip">Management IP</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchTargetType === 'mac' ? (
                <FormField
                  control={form.control}
                  name="targetMac"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>MAC Address</FormLabel>
                      <FormControl>
                        <Input placeholder="00:1A:2B:3C:4D:5E" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter the modem's MAC address (formats: 00:1A:2B:3C:4D:5E or 001A2B3C4D5E)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="targetIp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Management IP</FormLabel>
                      <FormControl>
                        <Input placeholder="10.20.30.40" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter the modem's CM management IP address
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                          {DURATION_PRESETS.map((preset) => (
                            <SelectItem key={preset.value} value={preset.value.toString()}>
                              {preset.label}
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
                          {CADENCE_PRESETS.map((preset) => (
                            <SelectItem key={preset.value} value={preset.value.toString()}>
                              {preset.label}
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
            <Button type="submit">
              Start Monitoring
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
