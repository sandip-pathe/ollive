"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

import type {
  AgentRunSummary,
  EvidencePacketResponse,
  MetricsOverview,
  Trace as ApiTrace,
} from "@/app/lib/api";
import { Badge } from "@/components/ui/badge";

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
  icon: React.ReactNode;
};

const BAD_STATUSES = new Set(["error", "timeout", "cancelled", "failed"]);

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function titleCase(value?: string | null) {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function toneClasses(tone: Tone) {
  switch (tone) {
    case "good":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "bad":
      return "border-rose-200 bg-rose-50 text-rose-950";
    default:
      return "border-[#d9d1c1] bg-[#fbfaf6] text-[#2f2d28]";
  }
}

function postureTone(posture?: string | null): Tone {
  if (posture === "insurable") return "good";
  if (posture === "blocked") return "bad";
  if (posture === "needs_review") return "watch";
  return "neutral";
}

function severityTone(severity?: string | null): Tone {
  if (severity === "critical" || severity === "high") return "bad";
  if (severity === "medium") return "watch";
  if (severity === "low") return "neutral";
  return "neutral";
}

function worstPosture(packet: EvidencePacketResponse | null, runs: AgentRunSummary[]) {
  const values = [
    packet?.packet.insurability_posture,
    ...runs.map((run) => run.insurability_posture),
  ].filter(Boolean);
  if (values.includes("blocked")) return "blocked";
  if (values.includes("needs_review")) return "needs_review";
  if (values.includes("insurable")) return "insurable";
  return "unknown";
}

function deriveReview(
  metrics: MetricsOverview | null,
  traces: ApiTrace[],
  runs: AgentRunSummary[],
  packet: EvidencePacketResponse | null,
) {
  const runTotal = runs.length;
  const traceTotal = traces.length;
  const totalEvidence = Math.max(runTotal, traceTotal);
  const riskEvents = packet?.risk_events ?? [];
  const failureNodes = packet?.failure_nodes ?? [];
  const readyPackets = runs.filter((run) => run.packet_status === "ready").length + (packet?.packet.status === "ready" ? 1 : 0);
  const packetTotal = runTotal + (packet ? 1 : 0);
  const blockedRuns = runs.filter((run) => run.insurability_posture === "blocked").length;
  const reviewRuns = runs.filter((run) => run.insurability_posture === "needs_review").length;
  const insurableRuns = runs.filter((run) => run.insurability_posture === "insurable").length;
  const missingStepRuns = runs.filter((run) => !asNumber(run.steps_count)).length;
  const failedTraces = traces.filter((trace) => BAD_STATUSES.has(String(trace.status))).length;
  const successTraces = traces.filter((trace) => trace.status === "success").length;
  const successRate = percent(successTraces, traceTotal);
  const errorRate = Math.max(percent(failedTraces, traceTotal), asNumber(metrics?.error_rate));
  const posture = worstPosture(packet, runs);
  const aiFindings = riskEvents.filter((event) => event.analysis_source === "ai").length;
  const deterministicFindings = riskEvents.filter((event) => event.analysis_source !== "ai").length;
  const primaryOwner = riskEvents[0]?.owner || failureNodes[0]?.owner || "Unassigned";

  const findings: Finding[] = [];

  if (!totalEvidence) {
    findings.push({
      tone: "watch",
      title: "No agent evidence captured",
      detail: "Ollive needs an AgentRun or chat trace before it can establish risk posture.",
      evidence: "0 AgentRuns and 0 traces available.",
      action: "Instrument a backend with the SDK or POST a run to /v1/runs.",
    });
  }

  for (const event of riskEvents.slice(0, 4)) {
    findings.push({
      tone: severityTone(event.severity),
      title: event.title,
      detail: event.reason,
      evidence: event.evidence_quote || event.evidence_source,
      action: event.remediation,
    });
  }

  for (const node of failureNodes.slice(0, Math.max(0, 4 - findings.length))) {
    findings.push({
      tone: "watch",
      title: titleCase(node.type),
      detail: "The packet could not prove this part of the run.",
      evidence: node.evidence,
      action: `Owner: ${node.owner}`,
    });
  }

  if (missingStepRuns && findings.length < 5) {
    findings.push({
      tone: "watch",
      title: "Missing step evidence",
      detail: "Some runs exist without ordered model, tool, handoff, or action steps.",
      evidence: `${missingStepRuns} run${missingStepRuns === 1 ? "" : "s"} have no captured steps.`,
      action: "Record model calls, tool calls, handoffs, and external actions through the SDK.",
    });
  }

  if (failedTraces && findings.length < 5) {
    findings.push({
      tone: "bad",
      title: "Runtime failures need owner review",
      detail: "Failed, timed out, or cancelled traces are user-visible reliability risk.",
      evidence: `${failedTraces} bad trace state${failedTraces === 1 ? "" : "s"} across ${traceTotal} traces.`,
      action: "Group failures by provider, retryability, and terminal status.",
    });
  }

  if (totalEvidence && findings.length === 0) {
    findings.push({
      tone: "good",
      title: "No material risk in current evidence",
      detail: "The available run evidence is currently insurable.",
      evidence: `${insurableRuns || runTotal} run${(insurableRuns || runTotal) === 1 ? "" : "s"} without material findings.`,
      action: "Keep collecting authority, tool, handoff, and side-effect evidence.",
    });
  }

  const cards: ScoreCard[] = [
    {
      label: "Risk posture",
      value: titleCase(posture),
      hint: `${blockedRuns} blocked, ${reviewRuns} review, ${insurableRuns} insurable.`,
      tone: postureTone(posture),
      icon: posture === "insurable" ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />,
    },
    {
      label: "Evidence packets",
      value: packetTotal ? `${readyPackets}/${packetTotal}` : "0/0",
      hint: `${failureNodes.length} failure node${failureNodes.length === 1 ? "" : "s"} in current packet.`,
      tone: failureNodes.length ? "watch" : packetTotal ? "good" : "neutral",
      icon: <FileWarning className="h-4 w-4" />,
    },
    {
      label: "Finding source",
      value: `${deterministicFindings} / ${aiFindings}`,
      hint: "Deterministic findings / optional AI review findings.",
      tone: riskEvents.length ? "watch" : totalEvidence ? "good" : "neutral",
      icon: <UserRoundCheck className="h-4 w-4" />,
    },
    {
      label: "Runtime health",
      value: traceTotal ? `${successRate}%` : "No traces",
      hint: `${failedTraces} failed; error rate ${errorRate}%.`,
      tone: traceTotal ? (errorRate ? "watch" : "good") : "neutral",
      icon: <Gauge className="h-4 w-4" />,
    },
  ];

  return {
    cards,
    findings: findings.slice(0, 6),
    runTotal,
    traceTotal,
    riskEvents,
    failureNodes,
    primaryOwner,
    posture,
  };
}

export function OpsReview({
  metrics,
  traces,
  agentRuns,
  evidencePacket,
}: {
  metrics: MetricsOverview | null;
  traces: ApiTrace[];
  agentRuns: AgentRunSummary[];
  evidencePacket: EvidencePacketResponse | null;
}) {
  const review = deriveReview(metrics, traces, agentRuns, evidencePacket);

  return (
    <section className="rounded-lg border border-[#cfd7df] bg-[#f7fafc] shadow-[0_8px_24px_rgba(32,45,58,0.06)]">
      <div className="flex flex-col gap-3 border-b border-[#d8e0e7] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-[#b9c8d6] bg-[#e9f1f8] text-[#24384a]">
              Agent risk posture
            </Badge>
            <Badge className={toneClasses(postureTone(review.posture))}>
              {titleCase(review.posture)}
            </Badge>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-normal text-[#1f2933]">
            Trust, auditability, accountability, and failure nodes
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#52616f]">
            Current run evidence across SDK ingest, chat traces, deterministic policy findings, and packet review.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-[#425466] sm:min-w-48">
          <SignalStat icon={<Activity className="h-4 w-4" />} label="Runs" value={String(review.runTotal)} />
          <SignalStat icon={<Gauge className="h-4 w-4" />} label="Traces" value={String(review.traceTotal)} />
          <SignalStat icon={<AlertTriangle className="h-4 w-4" />} label="Findings" value={String(review.riskEvents.length)} />
          <SignalStat icon={<FileWarning className="h-4 w-4" />} label="Gaps" value={String(review.failureNodes.length)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4 sm:px-5">
        {review.cards.map((card) => (
          <div key={card.label} className={`rounded-lg border px-3 py-3 ${toneClasses(card.tone)}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.16em] opacity-75">{card.label}</p>
              {card.icon}
            </div>
            <p className="mt-2 break-words text-2xl font-semibold tracking-normal">{card.value}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 border-t border-[#d8e0e7] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_300px] sm:px-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#617386]">
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
                  <InfoBox label="Evidence" value={finding.evidence} />
                  <InfoBox label="Action" value={finding.action} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-[#cfd7df] bg-[#edf4fa] px-4 py-3 text-sm text-[#25394a]">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#617386]">
            <UserRoundCheck className="h-4 w-4" />
            Accountability
          </div>
          <div className="mt-3 space-y-3 text-xs leading-5 text-[#52616f]">
            <p>
              Primary owner: <span className="font-medium text-[#1f2933]">{review.primaryOwner}</span>
            </p>
            <p>
              Founder view: <span className="font-medium text-[#1f2933]">{titleCase(review.posture)}</span>
            </p>
            <p>
              Engineer view: <span className="font-medium text-[#1f2933]">{review.failureNodes.length} failure nodes</span>
            </p>
            <p>
              Risk view: <span className="font-medium text-[#1f2933]">{review.riskEvents.length} findings</span>
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
    <div className="rounded-lg border border-[#cfd7df] bg-white px-3 py-2">
      <div className="flex items-center gap-2 text-[#617386]">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold text-[#1f2933]">{value}</div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-current/15 bg-white/55 px-3 py-2">
      <span className="font-medium">{label}:</span> {value}
    </div>
  );
}
