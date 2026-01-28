import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Sample {
  id: string;
  job_id: string;
  sequence_number: number;
  status: "success" | "missed" | "system_error";
  rtt_ms: number | null;
  recorded_at: string;
}

interface Job {
  id: string;
  account_number: string;
  target_mac: string | null;
  target_ip: string | null;
  duration_minutes: number;
  cadence_seconds: number;
  reason: string;
  notification_email: string;
  started_at: string;
  completed_at: string | null;
  requester_name: string;
}

interface JobSummary {
  totalSamples: number;
  successCount: number;
  missedCount: number;
  systemErrorCount: number;
  packetLossPercent: number;
  avgRttMs: number | null;
  maxRttMs: number | null;
  p95RttMs: number | null;
  successRate: number;
  outageEventCount: number;
  longestMissStreak: number;
  passPacketLoss: boolean;
  passLatency: boolean;
  overallPass: boolean;
}

const THRESHOLDS = {
  packet_loss_percent: 2,
  p95_latency_ms: 100,
  system_error_percent: 5,
};

function calculateJobSummary(samples: Sample[]): JobSummary {
  const totalSamples = samples.length;

  if (totalSamples === 0) {
    return {
      totalSamples: 0,
      successCount: 0,
      missedCount: 0,
      systemErrorCount: 0,
      packetLossPercent: 0,
      avgRttMs: null,
      maxRttMs: null,
      p95RttMs: null,
      successRate: 0,
      outageEventCount: 0,
      longestMissStreak: 0,
      passPacketLoss: true,
      passLatency: true,
      overallPass: true,
    };
  }

  const successCount = samples.filter((s) => s.status === "success").length;
  const missedCount = samples.filter((s) => s.status === "missed").length;
  const systemErrorCount = samples.filter((s) => s.status === "system_error").length;

  const validAttempts = successCount + missedCount;
  const packetLossPercent = validAttempts > 0 ? (missedCount / validAttempts) * 100 : 0;

  const rttValues = samples
    .filter((s) => s.status === "success" && s.rtt_ms !== null)
    .map((s) => s.rtt_ms as number)
    .sort((a, b) => a - b);

  const avgRttMs =
    rttValues.length > 0
      ? rttValues.reduce((sum, v) => sum + v, 0) / rttValues.length
      : null;

  const maxRttMs = rttValues.length > 0 ? Math.max(...rttValues) : null;

  const p95RttMs =
    rttValues.length > 0
      ? rttValues[Math.floor(rttValues.length * 0.95)] ?? rttValues[rttValues.length - 1]
      : null;

  const successRate = totalSamples > 0 ? (successCount / totalSamples) * 100 : 0;

  // Calculate outage events and longest miss streak
  const sorted = [...samples].sort((a, b) => a.sequence_number - b.sequence_number);
  let outageEventCount = 0;
  let longestMissStreak = 0;
  let currentMissStreak = 0;
  let wasInOutage = false;

  for (const sample of sorted) {
    if (sample.status === "missed") {
      currentMissStreak++;
      if (!wasInOutage && currentMissStreak >= 5) {
        outageEventCount++;
        wasInOutage = true;
      }
      longestMissStreak = Math.max(longestMissStreak, currentMissStreak);
    } else if (sample.status === "success") {
      currentMissStreak = 0;
      wasInOutage = false;
    }
  }

  const passPacketLoss = packetLossPercent <= THRESHOLDS.packet_loss_percent;
  const passLatency = p95RttMs === null || p95RttMs <= THRESHOLDS.p95_latency_ms;
  const overallPass = passPacketLoss && passLatency;

  return {
    totalSamples,
    successCount,
    missedCount,
    systemErrorCount,
    packetLossPercent,
    avgRttMs,
    maxRttMs,
    p95RttMs,
    successRate,
    outageEventCount,
    longestMissStreak,
    passPacketLoss,
    passLatency,
    overallPass,
  };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? "s" : ""}`;
}

function formatCadence(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  return `${Math.floor(seconds / 60)} min`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function generateEmailHtml(job: Job, summary: JobSummary, jobDetailUrl: string): string {
  const target = job.target_mac || job.target_ip || "N/A";
  const systemErrorPercent = summary.totalSamples > 0 
    ? (summary.systemErrorCount / summary.totalSamples) * 100 
    : 0;
  const showSystemErrorWarning = systemErrorPercent > THRESHOLDS.system_error_percent;

  const passColor = "#22c55e";
  const failColor = "#ef4444";
  const overallColor = summary.overallPass ? passColor : failColor;
  const overallText = summary.overallPass ? "PASS" : "FAIL";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monitoring Job Completed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; line-height: 1.6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #18181b; color: #ffffff; padding: 24px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">MONITORING JOB COMPLETED</h1>
              <p style="margin: 0; font-size: 14px; color: #a1a1aa;">
                Account: ${job.account_number} | ${target}
              </p>
            </td>
          </tr>

          <!-- Overall Result Badge -->
          <tr>
            <td style="padding: 32px; text-align: center; background-color: #fafafa;">
              <div style="display: inline-block; padding: 16px 48px; background-color: ${overallColor}; color: #ffffff; font-size: 32px; font-weight: 700; border-radius: 8px; letter-spacing: 2px;">
                ${overallText}
              </div>
            </td>
          </tr>

          <!-- Job Configuration -->
          <tr>
            <td style="padding: 24px; border-bottom: 1px solid #e4e4e7;">
              <h2 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">Job Configuration</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 4px 0; color: #52525b; font-size: 14px;">Duration: <strong style="color: #18181b;">${formatDuration(job.duration_minutes)}</strong></td>
                  <td style="padding: 4px 0; color: #52525b; font-size: 14px;">Cadence: <strong style="color: #18181b;">${formatCadence(job.cadence_seconds)}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #52525b; font-size: 14px;">Reason: <strong style="color: #18181b; text-transform: capitalize;">${job.reason}</strong></td>
                  <td style="padding: 4px 0; color: #52525b; font-size: 14px;">Started: <strong style="color: #18181b;">${formatDate(job.started_at)}</strong></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Metric Results -->
          <tr>
            <td style="padding: 24px; border-bottom: 1px solid #e4e4e7;">
              <h2 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">Metric Results</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden;">
                <tr style="background-color: #f4f4f5;">
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: #52525b;">Metric</th>
                  <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 600; color: #52525b;">Value</th>
                  <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 600; color: #52525b;">Threshold</th>
                  <th style="padding: 12px; text-align: center; font-size: 12px; font-weight: 600; color: #52525b;">Result</th>
                </tr>
                <tr>
                  <td style="padding: 12px; font-size: 14px; color: #18181b; border-top: 1px solid #e4e4e7;">Packet Loss</td>
                  <td style="padding: 12px; text-align: right; font-size: 14px; color: #18181b; border-top: 1px solid #e4e4e7;">${summary.packetLossPercent.toFixed(1)}%</td>
                  <td style="padding: 12px; text-align: right; font-size: 14px; color: #71717a; border-top: 1px solid #e4e4e7;">≤ ${THRESHOLDS.packet_loss_percent}%</td>
                  <td style="padding: 12px; text-align: center; border-top: 1px solid #e4e4e7;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${summary.passPacketLoss ? passColor : failColor}; color: #ffffff; font-size: 12px; font-weight: 600; border-radius: 4px;">${summary.passPacketLoss ? "PASS" : "FAIL"}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px; font-size: 14px; color: #18181b; border-top: 1px solid #e4e4e7;">p95 Latency</td>
                  <td style="padding: 12px; text-align: right; font-size: 14px; color: #18181b; border-top: 1px solid #e4e4e7;">${summary.p95RttMs !== null ? `${summary.p95RttMs.toFixed(0)}ms` : "N/A"}</td>
                  <td style="padding: 12px; text-align: right; font-size: 14px; color: #71717a; border-top: 1px solid #e4e4e7;">≤ ${THRESHOLDS.p95_latency_ms}ms</td>
                  <td style="padding: 12px; text-align: center; border-top: 1px solid #e4e4e7;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${summary.passLatency ? passColor : failColor}; color: #ffffff; font-size: 12px; font-weight: 600; border-radius: 4px;">${summary.passLatency ? "PASS" : "FAIL"}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Collection Statistics -->
          <tr>
            <td style="padding: 24px; border-bottom: 1px solid #e4e4e7;">
              <h2 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">Collection Statistics</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; color: #52525b; font-size: 14px;">Total Samples</td>
                  <td style="padding: 8px 0; text-align: right; color: #18181b; font-size: 14px; font-weight: 600;">${summary.totalSamples}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #52525b; font-size: 14px;">Successful</td>
                  <td style="padding: 8px 0; text-align: right; color: #18181b; font-size: 14px; font-weight: 600;">${summary.successCount} (${summary.successRate.toFixed(1)}%)</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #52525b; font-size: 14px;">Missed</td>
                  <td style="padding: 8px 0; text-align: right; color: #18181b; font-size: 14px; font-weight: 600;">${summary.missedCount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #52525b; font-size: 14px;">Outage Events (5+ consecutive)</td>
                  <td style="padding: 8px 0; text-align: right; color: #18181b; font-size: 14px; font-weight: 600;">${summary.outageEventCount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #52525b; font-size: 14px;">Longest Miss Streak</td>
                  <td style="padding: 8px 0; text-align: right; color: #18181b; font-size: 14px; font-weight: 600;">${summary.longestMissStreak}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #52525b; font-size: 14px;">System Errors</td>
                  <td style="padding: 8px 0; text-align: right; color: #18181b; font-size: 14px; font-weight: 600;">${summary.systemErrorCount} (${systemErrorPercent.toFixed(1)}%)</td>
                </tr>
              </table>
            </td>
          </tr>

          ${showSystemErrorWarning ? `
          <!-- System Error Warning -->
          <tr>
            <td style="padding: 16px 24px;">
              <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px 16px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>⚠️ Note:</strong> System errors exceeded ${THRESHOLDS.system_error_percent}% (${systemErrorPercent.toFixed(1)}%). Some samples may not reflect actual network conditions.
                </p>
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- CTA Button -->
          <tr>
            <td style="padding: 24px; text-align: center;">
              <a href="${jobDetailUrl}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                View Full Job Details
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; background-color: #f4f4f5; text-align: center;">
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                Generated: ${formatDate(new Date().toISOString())}
              </p>
              <p style="margin: 8px 0 0 0; color: #a1a1aa; font-size: 11px;">
                This is an automated notification from Soundcheck.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const { jobId, jobDetailUrl } = await req.json();

    if (!jobId) {
      throw new Error("jobId is required");
    }

    // Create Supabase client with service role key for full access
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobError?.message || "Unknown error"}`);
    }

    // Fetch all samples for the job
    const { data: samples, error: samplesError } = await supabase
      .from("samples")
      .select("*")
      .eq("job_id", jobId)
      .order("sequence_number", { ascending: true });

    if (samplesError) {
      throw new Error(`Failed to fetch samples: ${samplesError.message}`);
    }

    // Calculate summary metrics
    const summary = calculateJobSummary(samples || []);

    // Generate email HTML
    const detailUrl = jobDetailUrl || `https://your-app.lovable.app/jobs/${jobId}`;
    const emailHtml = generateEmailHtml(job as Job, summary, detailUrl);

    // Send email via Resend
    const resend = new Resend(resendApiKey);
    const target = job.target_mac || job.target_ip || "N/A";
    const resultText = summary.overallPass ? "PASS" : "FAIL";

    const emailResponse = await resend.emails.send({
      from: "Soundcheck <noreply@resend.dev>",
      to: [job.notification_email],
      subject: `[${resultText}] Monitoring Job Completed - Account ${job.account_number}`,
      html: emailHtml,
    });

    console.log("Completion email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: emailResponse.data?.id,
        recipient: job.notification_email,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-completion-email function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
