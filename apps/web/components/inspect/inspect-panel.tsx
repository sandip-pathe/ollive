"use client";

import { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "@/app/lib/api";
import type {
  MetricsOverview,
  Trace as ApiTrace,
  TraceDetail,
  TraceEvent as ApiTraceEvent,
} from "@/app/lib/api";
import { InspectTabs } from "./inspect-tabs";

const MODEL_LABEL = "gpt-4.1";

function formatTimeMs(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLatency(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${value} ms`;
}

function formatTokens(input?: number | null, output?: number | null) {
  if (input === null && output === null) return "—";
  return `${input ?? 0} in / ${output ?? 0} out`;
}

function estimateCost(trace?: ApiTrace | null) {
  if (!trace) return "$0.0000";
  if (
    trace.estimated_cost_usd !== null &&
    trace.estimated_cost_usd !== undefined
  ) {
    return `$${Number(trace.estimated_cost_usd).toFixed(4)}`;
  }
  const tokens = (trace.prompt_tokens || 0) + (trace.completion_tokens || 0);
  return `$${(tokens * 0.0000012).toFixed(4)}`;
}

function stringifiedPayload(payload: unknown) {
  if (!payload) return "{}";
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function metadataToLines(entries: Array<{ key: string; value?: string | null }> | undefined) {
  if (!entries || entries.length === 0) return ["No worker-extracted metadata yet."];
  return entries.map((entry) => `${entry.key}: ${entry.value ?? "-"}`);
}

export function InspectPanel({
  sessionId = "",
  onClose: _onClose,
}: {
  sessionId?: string;
  onClose?: () => void;
}) {
  const [traceList, setTraceList] = useState<ApiTrace[]>([]);
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedTrace =
    traceList.find(
      (trace) =>
        trace.trace_id === sessionId || trace.conversation_id === sessionId,
    ) ||
    traceList[0] ||
    null;

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const refreshList = async () => {
      try {
        const [metricData, traces] = await Promise.all([
          apiFetch<MetricsOverview>("/api/metrics/overview"),
          apiFetch<ApiTrace[]>("/api/traces?limit=100"),
        ]);
        if (!mounted) return;
        setMetrics(metricData);
        setTraceList(traces);
        const target =
          traces.find((trace) => trace.trace_id === sessionId) ||
          traces.find((trace) => trace.conversation_id === sessionId) ||
          traces[0] ||
          null;
        if (target) {
          const detail = await apiFetch<TraceDetail>(
            `/api/traces/${target.trace_id}`,
          );
          if (!mounted) return;
          setTraceDetail(detail);
        } else {
          setTraceDetail(null);
        }
        timeoutId = setTimeout(() => {
          void refreshList();
        }, 2000);
      } catch (error) {
        console.error("Failed to load inspect dashboard", error);
        if (mounted) {
          timeoutId = setTimeout(() => {
            void refreshList();
          }, 3000);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void refreshList();
    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    if (!selectedTrace?.trace_id) {
      setTraceDetail(null);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const refreshDetail = async () => {
      try {
        const detail = await apiFetch<TraceDetail>(
          `/api/traces/${selectedTrace.trace_id}`,
        );
        if (cancelled) return;
        setTraceDetail(detail);

        const traceStatus = detail.trace?.status;
        const completedAt = detail.trace?.completed_at;
        const hasMetadata = Boolean(
          detail.inference_log?.id &&
            ((detail.extracted_metadata && detail.extracted_metadata.length > 0) ||
              (detail.inference_log.extracted_metadata && detail.inference_log.extracted_metadata.length > 0)),
        );
        const terminalGraceMs = 30000;
        const shouldKeepPolling =
          traceStatus === "queued" ||
          traceStatus === "streaming" ||
          (!hasMetadata && (!completedAt || Date.now() - completedAt < terminalGraceMs));

        if (shouldKeepPolling) {
          timeoutId = setTimeout(() => {
            void refreshDetail();
          }, 1500);
        }
      } catch (error) {
        console.error("Failed to load trace detail", error);
        if (!cancelled) {
          timeoutId = setTimeout(() => {
            void refreshDetail();
          }, 2000);
        }
      }
    };

    void refreshDetail();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [selectedTrace?.trace_id]);

  useEffect(() => {
    if (!selectedTrace?.trace_id) return;
    const source = new EventSource(
      `${API_BASE}/api/traces/${selectedTrace.trace_id}/events/stream`,
    );
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ApiTraceEvent;
        setTraceDetail((current) => {
          if (!current) return current;
          if (current.events.some((item) => item.id === payload.id)) {
            return current;
          }
          return {
            ...current,
            events: [...current.events, payload],
          };
        });
      } catch (error) {
        console.error("Failed to parse live trace event", error);
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => {
      source.close();
    };
  }, [selectedTrace?.trace_id]);

  const trace = traceDetail?.trace || selectedTrace || null;
  const inferenceLog = traceDetail?.inference_log || null;
  const extractedMetadata = traceDetail?.extracted_metadata || inferenceLog?.extracted_metadata || [];
  const totalTokens = trace
    ? trace.total_tokens ||
      (trace.prompt_tokens || 0) + (trace.completion_tokens || 0)
    : 0;

  const summary = [
    {
      label: "Wrapper",
      value: `${trace?.request_payload_size ?? 0} bytes`,
      hint: `messages ${trace?.message_count ?? 0} - ctx ${trace?.context_length ?? 0}`,
    },
    {
      label: "Model",
      value: `${trace?.provider || "openai"} / ${trace?.model || MODEL_LABEL}`,
      hint: `status ${trace?.status || "queued"} - retry ${trace?.retry_count ?? 0}`,
    },
    {
      label: "Extraction",
      value: `${extractedMetadata.length} fields`,
      hint: `PII ${trace?.pii_detected ? "yes" : "no"} - worker signals`,
    },
    {
      label: "Outcome",
      value: estimateCost(trace),
      hint: `TTFT ${formatLatency(trace?.ttft_ms)} - ${trace?.avg_tokens_per_second ?? 0} tok/s`,
    },
  ];

  const sections = {
    events: traceDetail?.events.length
      ? traceDetail.events.map((event) => {
          const payload = event.payload || {};
          const payloadKeys = Object.keys(payload).slice(0, 3);
          const payloadSummary = payloadKeys.length
            ? ` - ${payloadKeys.map((key) => `${key}:${String((payload as Record<string, unknown>)[key])}`).join(" - ")}`
            : "";
          return `${formatTimeMs(event.timestamp)} - ${event.type}${event.duration_ms ? ` - ${event.duration_ms} ms` : ""}${payloadSummary}`;
        })
      : ["No runtime events yet."],
    tokens: trace
      ? [
          `Prompt tokens: ${trace.prompt_tokens ?? 0}`,
          `Completion tokens: ${trace.completion_tokens ?? 0}`,
          `Total tokens: ${totalTokens}`,
          `Chunks emitted: ${trace.chunks_count ?? 0}`,
          `Avg throughput: ${trace.avg_tokens_per_second ?? 0} tok/s`,
        ]
      : ["No token telemetry yet."],
    memory: traceDetail
      ? [
          `Conversation status: ${traceDetail.conversation?.status || "active"}`,
          `${traceDetail.messages.length} messages loaded from the backend`,
          `PII flag: ${trace?.pii_detected ? "yes" : "no"}`,
        ]
      : ["No trace selected."],
    network: trace
      ? [
          `${trace.provider} / ${trace.model}`,
          `Latency: ${formatLatency(trace.latency_ms)}`,
          `Retry count: ${trace.retry_count ?? 0}`,
          `Fallback: ${trace.provider_fallback || "none"}`,
          `Finish reason: ${trace.finish_reason || "pending"}`,
        ]
      : ["No network calls yet."],
    logs: trace
      ? [
          `Raw request size: ${trace.request_payload_size ?? 0} bytes`,
          `Raw response size: ${trace.response_payload_size ?? 0} bytes`,
          `Request preview: ${inferenceLog?.redacted_input_preview || trace.user_preview || "none"}`,
          `Response preview: ${inferenceLog?.redacted_output_preview || trace.assistant_preview || "none"}`,
        ]
      : ["No raw payloads yet."],
    metadata: metadataToLines(extractedMetadata),
    wrapper: trace
      ? [
          `Message count: ${trace.message_count ?? 0}`,
          `Context length: ${trace.context_length ?? 0}`,
          `Request JSON: ${stringifiedPayload(trace.raw_request_json)}`,
          `Response JSON: ${stringifiedPayload(trace.raw_response_json)}`,
        ]
      : ["No wrapper payload yet."],
  };

  return (
    <div className="flex h-full w-full min-w-0 min-h-0 flex-col overflow-hidden bg-[#f6f4ec] text-[#2f2d28]">
      <header className="flex w-full shrink-0 min-w-0 items-start justify-between gap-4 border-b border-[#ddd8cb] bg-[#f6f4ec] px-5 py-2">
        <div className="px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#676057]">
          Trace evidence console
        </div>
      </header>
      <div className="flex flex-1 w-full min-w-0 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-[#6f685e]">
            Loading trace evidence...
          </div>
        ) : (
          <InspectTabs
            traces={traceList}
            selectedTrace={trace}
            summary={summary}
            sections={sections}
          />
        )}
      </div>
    </div>
  );
}
