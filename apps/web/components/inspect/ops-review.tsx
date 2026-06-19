"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Gauge,
  ShieldCheck,
  Signal,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { MetricsOverview, Trace as ApiTrace } from "@/app/lib/api";

type Tone = "good" | "watch" | "bad" | "neutral";

type Finding = {
  tone: Tone;
  title: string;
  detail: string;
  evidence: string;
  action: string;
};

type ScoreCard = {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
};

const BAD_STATUSES = new Set(["error", "timeout", "cancelled"]);

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function formatMs(value: number) {
  if (!value) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatMoney(value: number) {
  if (!value) return "$0.0000";
  return `$${value.toFixed(4)}`;
}

function toneClasses(tone: Tone) {
  switch (tone) {
    case "good":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "bad":
      return "border-rose-200 bg-rose-50 text-rose-900";
    default:
      return "border-[#ded8ca] bg-[#fbfaf6] text-[#2f2d28]";
  }
}

function scoreTone(score: number): Tone {
  if (score >= 80) return "good";
  if (score >= 55) return "watch";
  if (score > 0) return "bad";
  return "neutral";
}

function traceAgeMs(trace: ApiTrace) {
  const timestamp = trace.completed_at || trace.started_at || trace.created_at || 0;
  return timestamp ? Date.now() - timestamp : 0;
}

function deriveReview(metrics: MetricsOverview | null, traces: ApiTrace[]) {
  const total = traces.length;
  const success = traces.filter((trace) => trace.status === "success").length;
  const failed = traces.filter((trace) => BAD_STATUSES.has(String(trace.status))).length;
  const staleStreaming = traces.filter(
    (trace) => trace.status === "streaming" && traceAgeMs(trace) > 60_000,
  ).length;
  const pii = traces.filter((trace) => Boolean(trace.pii_detected)).length;
  const missingEvents = traces.filter((trace) => !asNumber(trace.events_count)).length;
  const missingResponse = traces.filter(
    (trace) => trace.status === "success" && !trace.raw_response_json && !trace.assistant_preview,
  ).length;
  const missingCost = traces.filter(
    (trace) =>
      trace.status === "success" &&
      !asNumber(trace.estimated_cost_usd) &&
      !asNumber(trace.total_tokens),
  ).length;
  const longContext = traces.filter(
    (trace) => asNumber(trace.context_length) > 8_000 || asNumber(trace.request_payload_size) > 16_000,
  ).length;

  const latencies = traces.map((trace) => asNumber(trace.latency_ms)).filter(Boolean);
  const ttfts = traces.map((trace) => asNumber(trace.ttft_ms)).filter(Boolean);
  const p95Latency = percentile(latencies, 95);
  const p50Ttft = percentile(ttfts, 50);
  const totalTokens = traces.reduce(
    (sum, trace) => sum + asNumber(trace.total_tokens || asNumber(trace.prompt_tokens) + asNumber(trace.completion_tokens)),
    0,
  );
  const totalCost = traces.reduce((sum, trace) => sum + asNumber(trace.estimated_cost_usd), 0);
  const eventCoverage = total ? 100 - percent(missingEvents, total) : 0;
  const responseCoverage = total ? 100 - percent(missingResponse, total) : 0;
  const costCoverage = total ? 100 - percent(missingCost, total) : 0;
  const successRate = percent(success, total);
  const errorRate = Math.max(percent(failed, total), asNumber(metrics?.error_rate));

  const reliabilityScore = total ? Math.max(0, 100 - errorRate - staleStreaming * 15) : 0;
  const evidenceScore = total ? Math.round(eventCoverage * 0.35 + responseCoverage * 0.35 + costCoverage * 0.3) : 0;
  const efficiencyScore = total
    ? Math.max(0, Math.min(100, 100 - percent(longContext, total) * 0.6 - (p95Latency > 8000 ? 20 : 0)))
    : 0;
  const safetyScore = total ? Math.max(0, 100 - percent(pii, total) * 0.8) : 0;
  const overallScore = total
    ? Math.round(reliabilityScore * 0.35 + evidenceScore * 0.3 + efficiencyScore * 0.2 + safetyScore * 0.15)
    : 0;

  const findings: Finding[] = [];

  if (!total) {
    findings.push({
      tone: "watch",
      title: "No trace evidence captured for this workspace",
      detail: "The system cannot prove reliability, cost, or user impact until it observes real conversations.",
      evidence: "0 traces, 0 conversations, 0 inference logs for the current user.",
      action: "Run three representative prompts: happy path, long context, and failure/retry. The review will start ranking risks from those traces.",
    });
    findings.push({
      tone: "bad",
      title: "Demo cannot claim observability yet",
      detail: "A trace table alone is instrumentation. Observability starts when the product can explain operational risk from evidence.",
      evidence: "Metrics endpoint reports no request volume and no status breakdown.",
      action: "Use the agent insurance review as the lead screen, then show how each recommendation links back to trace fields.",
    });
  }

  if (failed > 0) {
    findings.push({
      tone: "bad",
      title: `${failed} request${failed === 1 ? "" : "s"} ended in a bad state`,
      detail: "Errors, timeouts, and cancelled requests are the first business-facing failure signal.",
      evidence: `${successRate}% success rate across ${total} traced request${total === 1 ? "" : "s"}.`,
      action: "Group failures by provider error, retryability, and user-visible outcome before adding more dashboard panels.",
    });
  }

  if (staleStreaming > 0) {
    findings.push({
      tone: "bad",
      title: "Streaming requests can get stuck",
      detail: "A long-running streaming trace without terminal state is an incident candidate.",
      evidence: `${staleStreaming} trace${staleStreaming === 1 ? " is" : "s are"} still streaming after 60 seconds.`,
      action: "Add a timeout finalizer that marks stale streams as timeout and records the interruption reason.",
    });
  }

  if (missingEvents > 0 && total > 0) {
    findings.push({
      tone: "watch",
      title: "Trace event coverage is incomplete",
      detail: "Without event coverage, debugging turns into guessing even if the request row exists.",
      evidence: `${eventCoverage}% of traces have runtime events.`,
      action: "Require request_started, provider_connected, first_token, and terminal events for every stream.",
    });
  }

  if (missingCost > 0 && total > 0) {
    findings.push({
      tone: "watch",
      title: "Cost telemetry is not complete",
      detail: "Business users need cost per successful answer, not only token counts on individual rows.",
      evidence: `${costCoverage}% of successful traces have cost or token evidence.`,
      action: "Normalize provider usage payloads into prompt_tokens, completion_tokens, total_tokens, and estimated_cost_usd.",
    });
  }

  if (p95Latency > 8000) {
    findings.push({
      tone: "watch",
      title: "Latency is drifting into user-visible pain",
      detail: "Slow p95 latency matters more than average latency when a buyer asks whether the system is production ready.",
      evidence: `p95 latency is ${formatMs(p95Latency)}; median first token is ${formatMs(p50Ttft)}.`,
      action: "Split latency into queue time, provider time, first token, and stream duration so the owner knows where to fix it.",
    });
  }

  if (longContext > 0) {
    findings.push({
      tone: "watch",
      title: "Context growth needs a budget",
      detail: "Long prompts are a cost and latency problem before they become a model-quality problem.",
      evidence: `${longContext} trace${longContext === 1 ? "" : "s"} crossed the context or request-size threshold.`,
      action: "Add per-conversation context budget warnings and summarize old turns before the request is sent.",
    });
  }

  if (pii > 0) {
    findings.push({
      tone: "bad",
      title: "PII appeared in the trace path",
      detail: "Sensitive-data handling is a trust feature, not an implementation detail.",
      evidence: `${pii} trace${pii === 1 ? "" : "s"} were flagged by redaction checks.`,
      action: "Show the redaction category, affected field, and whether raw payload storage was suppressed.",
    });
  }

  if (total > 0 && findings.length === 0) {
    findings.push({
      tone: "good",
      title: "No acute operational risk in the current sample",
      detail: "The current traces are clean enough to support a short demo, but the sample is still small.",
      evidence: `${successRate}% success, ${eventCoverage}% event coverage, ${formatMoney(totalCost)} observed cost.`,
      action: "Increase sample size with real user workflows and keep this review as the first screen in the demo.",
    });
  }

  const cards: ScoreCard[] = [
    {
      label: "Ops health",
      value: total ? `${overallScore}/100` : "No signal",
      hint: total ? "Blends reliability, telemetry coverage, cost evidence, and safety." : "Needs real traces before scoring.",
      tone: scoreTone(overallScore),
    },
    {
      label: "User impact",
      value: total ? `${successRate}% success` : "Unproven",
      hint: `${failed} bad state${failed === 1 ? "" : "s"}; ${staleStreaming} stale stream${staleStreaming === 1 ? "" : "s"}.`,
      tone: total ? scoreTone(successRate) : "neutral",
    },
    {
      label: "Exposure signal",
      value: total ? formatMoney(totalCost) : "$0.0000",
      hint: `${totalTokens.toLocaleString()} tokens observed; ${costCoverage}% cost coverage.`,
      tone: missingCost ? "watch" : total ? "good" : "neutral",
    },
    {
      label: "Evidence quality",
      value: total ? `${evidenceScore}/100` : "No evidence",
      hint: `${eventCoverage}% events, ${responseCoverage}% response, ${costCoverage}% cost.`,
      tone: scoreTone(evidenceScore),
    },
  ];

  return {
    cards,
    findings: findings.slice(0, 6),
    total,
    success,
    failed,
    pii,
    p95Latency,
    p50Ttft,
    eventCoverage,
    overallScore,
  };
}

export function OpsReview({
  metrics,
  traces,
}: {
  metrics: MetricsOverview | null;
  traces: ApiTrace[];
}) {
  const review = deriveReview(metrics, traces);
  const latestTrace = traces[0];

  return (
    <section className="rounded-lg border border-[#d9d1c1] bg-[#fbfaf6] shadow-[0_8px_24px_rgba(55,46,28,0.05)]">
      <div className="flex flex-col gap-3 border-b border-[#e2dacb] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-[#d7ccb8] bg-[#efe7d8] text-[#4c4539]">
              Agent insurance review
            </Badge>
            <Badge className={toneClasses(scoreTone(review.overallScore))}>
              {review.total ? "Evidence-backed" : "Waiting for signal"}
            </Badge>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-normal text-[#24211d]">
            What the agent did, what failed, and what needs accountability
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#665f55]">
            This is the technical observability layer below the insurance packet:
            runtime reliability, evidence completeness, safety flags, and exposure signals.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-[#5f574d] sm:min-w-48">
          <SignalStat icon={<Activity className="h-4 w-4" />} label="Traces" value={String(review.total)} />
          <SignalStat icon={<Target className="h-4 w-4" />} label="Success" value={String(review.success)} />
          <SignalStat icon={<AlertTriangle className="h-4 w-4" />} label="Risk" value={String(review.failed)} />
          <SignalStat icon={<ShieldCheck className="h-4 w-4" />} label="PII flags" value={String(review.pii)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4 sm:px-5">
        {review.cards.map((card) => (
          <div key={card.label} className={`rounded-lg border px-3 py-3 ${toneClasses(card.tone)}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.16em] opacity-75">{card.label}</p>
              {card.label === "Exposure signal" ? (
                <DollarSign className="h-4 w-4 opacity-70" />
              ) : card.label === "Evidence quality" ? (
                <Signal className="h-4 w-4 opacity-70" />
              ) : (
                <Gauge className="h-4 w-4 opacity-70" />
              )}
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-normal">{card.value}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 border-t border-[#e2dacb] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_280px] sm:px-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7c7367]">
            <AlertTriangle className="h-4 w-4" />
            Risk action queue
          </div>
          <div className="space-y-3">
            {review.findings.map((finding) => (
              <div key={finding.title} className={`rounded-lg border px-4 py-3 ${toneClasses(finding.tone)}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold tracking-normal">{finding.title}</h3>
                    <p className="mt-1 text-sm leading-6 opacity-85">{finding.detail}</p>
                  </div>
                  {finding.tone === "good" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 opacity-70" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0 opacity-70" />
                  )}
                </div>
                <div className="mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-2">
                  <div className="rounded-md border border-current/15 bg-white/45 px-3 py-2">
                    <span className="font-medium">Evidence:</span> {finding.evidence}
                  </div>
                  <div className="rounded-md border border-current/15 bg-white/45 px-3 py-2">
                    <span className="font-medium">Next action:</span> {finding.action}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-[#ded6c7] bg-[#f7f3ea] px-4 py-3 text-sm text-[#3f382f]">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7c7367]">
            <Signal className="h-4 w-4" />
            Board narrative
          </div>
          <p className="mt-3 leading-6">
            Lead with this: the product watches the LLM runtime like an operator,
            not a log viewer. It scores whether the system is reliable, explainable,
            and economically safe enough to trust.
          </p>
          <div className="mt-4 space-y-2 text-xs leading-5 text-[#665f55]">
            <p>
              p95 latency: <span className="font-medium text-[#2f2d28]">{formatMs(review.p95Latency)}</span>
            </p>
            <p>
              median first token: <span className="font-medium text-[#2f2d28]">{formatMs(review.p50Ttft)}</span>
            </p>
            <p>
              event coverage: <span className="font-medium text-[#2f2d28]">{review.eventCoverage}%</span>
            </p>
            <p>
              latest trace: <span className="font-medium text-[#2f2d28]">{latestTrace?.status || "none"}</span>
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SignalStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#ded6c7] bg-[#f8f3ea] px-3 py-2">
      <div className="flex items-center gap-2 text-[#766e62]">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold text-[#2f2d28]">{value}</div>
    </div>
  );
}
