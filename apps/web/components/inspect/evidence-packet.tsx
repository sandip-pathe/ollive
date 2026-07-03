"use client";

import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  FileSearch,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

import type { EvidencePacketResponse, Trace as ApiTrace } from "@/app/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Tone = "good" | "watch" | "bad" | "neutral";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function toneClasses(tone: Tone) {
  switch (tone) {
    case "good":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "bad":
      return "border-rose-200 bg-rose-50 text-rose-950";
    default:
      return "border-[#ded8ca] bg-[#fbfaf6] text-[#2f2d28]";
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

function titleCase(value?: string | null) {
  if (!value) return "Unknown";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function percent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function sortedEvents(packet: EvidencePacketResponse | null) {
  return [...(packet?.risk_events || [])].sort((a, b) => {
    const severityDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (severityDiff !== 0) return severityDiff;
    return (b.confidence || 0) - (a.confidence || 0);
  });
}

export function EvidencePacketPanel({
  packet,
  selectedTrace,
  onRecompute,
  recomputing,
}: {
  packet: EvidencePacketResponse | null;
  selectedTrace: ApiTrace | null;
  onRecompute?: () => void;
  recomputing?: boolean;
}) {
  if (!selectedTrace) {
    return (
      <section className="rounded-lg border border-dashed border-[#d5cfbf] bg-[#f9f6ee] px-4 py-6 text-sm text-[#6f685e]">
        Select a trace to generate an agent insurance evidence packet.
      </section>
    );
  }

  const status = packet?.packet.status || "pending";
  const posture = packet?.packet.insurability_posture || "unknown";
  const tone = postureTone(posture);
  const events = sortedEvents(packet);
  const failureNodes = packet?.failure_nodes || [];
  const auditTrail = packet?.audit_trail || {};
  const riskCount = events.length;
  const exportPacket = () => {
    if (!packet) return;
    const blob = new Blob([JSON.stringify(packet, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ollive-evidence-packet-${packet.packet.run_id || packet.packet.trace_id || "run"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className="rounded-lg border border-[#d9d1c1] bg-[#fbfaf6] shadow-[0_8px_24px_rgba(55,46,28,0.05)]">
      <div className="flex flex-col gap-4 border-b border-[#e2dacb] px-4 py-4 lg:flex-row lg:items-start lg:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-[#cdbf9f] bg-[#efe4cf] text-[#4d4332]">
              Agent insurance observability
            </Badge>
            <Badge className={toneClasses(tone)}>
              {titleCase(posture)}
            </Badge>
            <Badge className={toneClasses(status === "error" ? "bad" : status === "pending" ? "watch" : "good")}>
              {titleCase(status)}
            </Badge>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-normal text-[#24211d]">
            Agent Risk & Insurability Evidence Packet
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#665f55]">
            Trust, auditability, accountability, and failure-node analysis for this chat-as-agent run.
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto">
          <Button
            type="button"
            variant="outline"
            className="w-full border-[#d5cbb8] bg-[#fbfaf6] text-[#4f473d] hover:bg-[#f2eadb] sm:w-auto"
            onClick={exportPacket}
            disabled={!packet}
          >
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full border-[#d5cbb8] bg-[#fbfaf6] text-[#4f473d] hover:bg-[#f2eadb] sm:w-auto"
            onClick={onRecompute}
            disabled={!onRecompute || recomputing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${recomputing ? "animate-spin" : ""}`} />
            Recompute
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4 sm:px-5">
        <PacketStat
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Insurability posture"
          value={titleCase(posture)}
          hint={packet?.packet.summary || "Packet pending for this trace."}
          tone={tone}
        />
        <PacketStat
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Risk events"
          value={String(riskCount)}
          hint={riskCount ? "Sorted by severity and confidence." : "No material risk events recorded yet."}
          tone={riskCount ? "watch" : "good"}
        />
        <PacketStat
          icon={<UserRoundCheck className="h-4 w-4" />}
          label="Primary owner"
          value={events[0]?.owner || failureNodes[0]?.owner || "Unassigned"}
          hint={events[0]?.remediation || failureNodes[0]?.evidence || "No owner action required yet."}
          tone={events.length || failureNodes.length ? "watch" : "neutral"}
        />
        <PacketStat
          icon={<FileSearch className="h-4 w-4" />}
          label="Audit trail"
          value={String(auditTrail.policy_pack || "agentic_insurance_v1")}
          hint={`${auditTrail.source_trace_events ?? 0} source events, redacted ${auditTrail.redacted === false ? "no" : "yes"}.`}
          tone="neutral"
        />
      </div>

      <div className="grid gap-4 border-t border-[#e2dacb] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_320px] sm:px-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7c7367]">
            <AlertTriangle className="h-4 w-4" />
            Risk action queue
          </div>

          {status === "pending" ? (
            <EmptyRiskState title="Packet pending" detail="The classifier is turning raw trace evidence into insurance-grade risk events." />
          ) : status === "error" ? (
            <EmptyRiskState title="Packet generation failed" detail={packet?.packet.summary || "Recompute this packet once the trace is complete."} tone="bad" />
          ) : events.length ? (
            <div className="space-y-3">
              {events.map((event) => (
                <article key={event.id} className={`rounded-lg border px-4 py-3 ${toneClasses(severityTone(event.severity))}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold tracking-normal">{event.title}</h3>
                        <Badge className="border-current/20 bg-white/45 text-current">
                          {titleCase(event.risk_category)}
                        </Badge>
                        <Badge className="border-current/20 bg-white/45 text-current">
                          {titleCase(event.analysis_source || "deterministic")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm leading-6 opacity-85">{event.reason}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs leading-5 opacity-80">
                      <div>{titleCase(event.severity)}</div>
                      <div>{percent(event.confidence)} confidence</div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-3">
                    <InfoBox label="Evidence" value={event.evidence_quote || "No quote captured."} />
                    <InfoBox label="Owner" value={event.owner} />
                    <InfoBox label="Remediation" value={event.remediation} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyRiskState title="No material risk events" detail="This run is currently insurable from the available trace evidence." tone="good" />
          )}
        </div>

        <aside className="rounded-lg border border-[#ded6c7] bg-[#f7f3ea] px-4 py-3 text-sm text-[#3f382f]">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7c7367]">
            <ClipboardCheck className="h-4 w-4" />
            Accountability
          </div>
          <div className="mt-3 space-y-3 text-xs leading-5 text-[#665f55]">
            <p>
              Trace: <span className="font-medium text-[#2f2d28]">{selectedTrace.trace_id}</span>
            </p>
            <p>
              Classifier: <span className="font-medium text-[#2f2d28]">{String(auditTrail.classifier_version || "risk-classifier-v2")}</span>
            </p>
            <p>
              Policy pack: <span className="font-medium text-[#2f2d28]">{String(auditTrail.policy_pack || "agentic_insurance_v1")}</span>
            </p>
            <p>
              AI review: <span className="font-medium text-[#2f2d28]">{String(auditTrail.llm_classifier || "disabled")}</span>
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#7c7367]">
              Failure nodes
            </div>
            {failureNodes.length ? (
              failureNodes.map((node) => (
                <div key={`${node.type}-${node.evidence}`} className="rounded-md border border-[#ddd3c2] bg-[#fbfaf6] px-3 py-2 text-xs leading-5 text-[#4d453c]">
                  <div className="font-medium text-[#2f2d28]">{titleCase(node.type)}</div>
                  <div>{node.evidence}</div>
                  <div className="mt-1 text-[#7a7165]">Owner: {node.owner}</div>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-[#ddd3c2] bg-[#fbfaf6] px-3 py-2 text-xs text-[#6f685e]">
                No failure nodes in the current packet.
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function PacketStat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: Tone;
}) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${toneClasses(tone)}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.16em] opacity-75">{label}</p>
        {icon}
      </div>
      <p className="mt-2 break-words text-2xl font-semibold tracking-normal">{value}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{hint}</p>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-current/15 bg-white/45 px-3 py-2">
      <span className="font-medium">{label}:</span> {value}
    </div>
  );
}

function EmptyRiskState({
  title,
  detail,
  tone = "neutral",
}: {
  title: string;
  detail: string;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-lg border px-4 py-4 ${toneClasses(tone)}`}>
      <h3 className="text-sm font-semibold tracking-normal">{title}</h3>
      <p className="mt-1 text-sm leading-6 opacity-85">{detail}</p>
    </div>
  );
}
