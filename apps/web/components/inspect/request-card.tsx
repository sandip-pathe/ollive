"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, API_BASE } from "@/app/lib/api";
import { cn } from "@/lib/utils";
import Sparkline from "./sparkline";
import type { Trace as ApiTrace, TraceDetail } from "@/app/lib/api";

type TraceEventLike = {
  id?: string;
  type?: string;
  timestamp?: number | string | undefined;
  duration_ms?: number | null;
  payload?: Record<string, unknown> | null;
};

function eventMessage(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined || value === "") return "error";
  return String(value);
}

function metadataValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function eventTitle(type?: string) {
  switch (type) {
    case "request_started":
      return "Request started";
    case "provider_connected":
      return "Model connected";
    case "first_token":
      return "First token";
    case "chunk":
      return "Streaming chunk";
    case "streaming":
      return "Streaming";
    case "stream_completed":
      return "Stream completed";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    case "retry":
      return "Retry";
    default:
      return (type || "event").replace(/_/g, " ");
  }
}

function eventSummary(event: TraceEventLike) {
  const payload = (event.payload || {}) as Record<string, unknown>;
  const payloadEntries = Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && value !== "");
  const type = event.type || "event";

  if (type === "request_started") {
    return `${metadataValue(payload.provider)} / ${metadataValue(payload.model)} • ${metadataValue(payload.message_count)} messages`;
  }
  if (type === "provider_connected") {
    return Boolean(payload.stubbed) ? "stubbed response path" : `status ${metadataValue(payload.status_code)}`;
  }
  if (type === "first_token") {
    return Boolean(payload.stubbed) ? `stubbed first token • ${metadataValue(payload.chunk_length)} chars` : `first token • ${metadataValue(payload.chunk_length)} chars`;
  }
  if (type === "chunk") {
    return `chunk ${metadataValue(payload.chunk_length)} chars`;
  }
  if (type === "streaming") {
    return `${metadataValue(payload.chunks_count)} chunks • ${metadataValue(payload.total_chunk_chars)} chars`;
  }
  if (type === "stream_completed") {
    return `chunks ${metadataValue(payload.chunks_count)}${payload.finish_reason ? ` • ${metadataValue(payload.finish_reason)}` : ""}`;
  }
  if (type === "warning" || type === "error") {
    return metadataValue(payload.message || payload.error || "Issue reported");
  }

  return payloadEntries
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${metadataValue(value)}`)
    .join(" • ") || "No extra details";
}

function summarizeEvents(events: TraceEventLike[] | undefined) {
  if (!events || events.length === 0) return [] as TraceEventLike[];
  const out: TraceEventLike[] = [];
  for (const ev of events) {
    if (ev.type === 'chunk') {
      const last = out[out.length - 1];
      if (last && last.type === 'streaming') {
        // accumulate
        const prevCount = (last.payload && (last.payload as any).chunks_count) || 0;
        const prevTotal = (last.payload && (last.payload as any).total_chunk_chars) || 0;
        const thisLen = ev.payload && (ev.payload as any).chunk_length ? Number((ev.payload as any).chunk_length) : 0;
        (last.payload as any).chunks_count = prevCount + 1;
        (last.payload as any).total_chunk_chars = prevTotal + thisLen;
        if (!last.duration_ms) last.duration_ms = 0;
        last.duration_ms = (last.duration_ms || 0) + (ev.duration_ms || 0);
      } else {
        // create synthetic streaming event
        out.push({
          id: ev.id,
          type: 'streaming',
          timestamp: (ev as any).timestamp,
          duration_ms: ev.duration_ms,
          payload: { chunks_count: 1, total_chunk_chars: ev.payload && (ev.payload as any).chunk_length ? Number((ev.payload as any).chunk_length) : 0 },
        } as TraceEventLike);
      }
    } else {
      out.push(ev);
    }
  }
  return out;
}

export function RequestCard({ trace }: { trace: ApiTrace }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [latencySamples, setLatencySamples] = useState<number[]>([]);
  const [throughputSamples, setThroughputSamples] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    void (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<TraceDetail>(`/api/traces/${trace.trace_id}`);
        if (!mounted) return;
        setDetail(data);

        const events = (data.events || []) as TraceEventLike[];
        const latencies = events
          .map((event) => event.duration_ms || 0)
          .filter((value): value is number => Boolean(value));
        const through = events
          .map((event) =>
            event.payload && event.payload.chunk_length ? Number(event.payload.chunk_length) : 0,
          )
          .filter((value): value is number => Boolean(value));
        setLatencySamples(latencies.slice(-20));
        setThroughputSamples(through.slice(-20));
      } catch (err) {
        console.error("Failed to load trace detail", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const es = new EventSource(`${API_BASE}/api/traces/${trace.trace_id}/events/stream`);
    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as TraceEventLike;
        setDetail((current) => {
          if (!current) return current;
          const events = (current.events || []) as TraceEventLike[];
          if (events.some((event) => event.id === payload.id)) return current;
          const nextEvents = [...events, payload] as TraceDetail["events"];
          const next = { ...current, events: nextEvents };
          if (payload.duration_ms) {
            setLatencySamples((samples) => [...samples.slice(-19), payload.duration_ms || 0]);
          }
          const chunkLength = payload.payload?.chunk_length;
          if (chunkLength) {
            setThroughputSamples((samples) => [...samples.slice(-19), Number(chunkLength)]);
          }
          return next;
        });
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => {
      es.close();
    };

    return () => {
      mounted = false;
      es.close();
    };
  }, [open, trace.trace_id]);

  const createdAt = trace.created_at
    ? new Date(trace.created_at).toLocaleString()
    : trace.started_at
      ? new Date(trace.started_at).toLocaleString()
      : "-";
  const status = trace.status || "queued";
  const cost =
    trace.estimated_cost_usd !== undefined && trace.estimated_cost_usd !== null
      ? `$${Number(trace.estimated_cost_usd).toFixed(4)}`
      : "-";
  const errorEvent = detail?.events?.find((event) => (event as { type?: string }).type === "error");
  const errorText =
    trace.status === "error"
      ? eventMessage((errorEvent as { payload?: { message?: unknown } | null } | undefined)?.payload?.message)
      : "None";
  const metadataEntries = detail?.extracted_metadata || detail?.inference_log?.extracted_metadata || [];
  const inputPreview = detail?.inference_log?.redacted_input_preview || trace.user_preview || "-";
  const outputPreview = detail?.inference_log?.redacted_output_preview || trace.assistant_preview || "-";

  const eventsToRender = summarizeEvents(detail?.events);

  return (
    <article className="rounded-2xl border border-[#e6dfcf] bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium text-[#2f2d28]">{trace.conversation_id ?? trace.trace_id}</h3>
            <Badge className="border-[#e9e2d3] bg-[#f6f4ec] text-xs text-[#6e675c]">
              {trace.provider} / {trace.model}
            </Badge>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                status === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : status === "error"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-50 text-slate-700",
              )}
            >
              {status}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6f685e]">{createdAt}</p>
        </div>

        <div className="grid grid-cols-1 gap-2 text-left text-sm text-[#6f685e] sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] sm:gap-3">
          <Stat label="Latency" value={trace.latency_ms ? `${trace.latency_ms} ms` : "-"} />
          <Stat label="Tokens" value={String(trace.total_tokens ?? ((trace.prompt_tokens || 0) + (trace.completion_tokens || 0)))} />
          <Stat label="Cost" value={cost} />
          <div className="flex items-end sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen((current) => !current)}>
              {open ? "Collapse" : "Inspect"}
            </Button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="mt-3 border-t pt-3">
          {loading ? (
            <div className="text-sm text-[#6f685e]">Loading details...</div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Request (input)</h4>
                <pre className="max-h-36 overflow-auto rounded-lg border bg-[#fbfbfb] p-3 font-mono text-xs text-[#2f2d28] sm:text-sm">{JSON.stringify(detail?.trace?.raw_request_json || trace.raw_request_json || { message_count: trace.message_count || 0, context_length: trace.context_length || 0, user_preview: trace.user_preview || null }, null, 2)}</pre>

                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Wrapper preview</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <PreviewCard label="Input preview" value={inputPreview} />
                  <PreviewCard label="Output preview" value={outputPreview} />
                </div>

                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Worker extracted metadata</h4>
                {metadataEntries.length ? (
                  <div className="flex flex-wrap gap-2">
                    {metadataEntries.map((entry, index) => (
                      <span
                        key={`${entry.key}-${index}`}
                        className="rounded-full border border-[#e7dfcf] bg-[#fbfaf6] px-3 py-1 text-xs text-[#4b443a]"
                      >
                        <span className="text-[#8c8478]">{entry.key}:</span> {metadataValue(entry.value)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#e7dfcf] bg-[#fbfaf6] px-3 py-2 text-sm text-[#6f685e]">
                    No worker-extracted metadata yet.
                  </div>
                )}

                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Trace events</h4>
                <div className="space-y-2 rounded-xl border border-[#e7dfcf] bg-[#fbfaf6] px-3 py-3">
                  {eventsToRender?.length ? (
                    eventsToRender.map((event) => (
                      <div key={event.id} className="rounded-lg border border-[#e7dfcf] bg-white px-3 py-2 text-sm text-[#4b443a]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-[#2f2d28]">{eventTitle(event.type)}</span>
                          <span className="text-xs text-[#8c8478]">{event.timestamp ? new Date(event.timestamp as any).toLocaleString() : "-"}</span>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-[#6f685e]">
                          {eventSummary(event)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#6f685e]">No runtime events yet.</div>
                  )}
                </div>

                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Performance</h4>
                <div className="grid grid-cols-1 gap-2 text-sm text-[#6f685e] sm:grid-cols-2">
                  <Metric label="TTFT" value={trace.ttft_ms ? `${trace.ttft_ms} ms` : "-"} />
                  <Metric label="Throughput" value={trace.avg_tokens_per_second ? `${trace.avg_tokens_per_second} tok/s` : "-"} />
                  <Metric label="Retries" value={String(trace.retry_count ?? 0)} />
                  <Metric label="Errors" value={errorText} />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Response (output)</h4>
                <pre className="max-h-36 overflow-auto rounded-lg border bg-[#fbfbfb] p-3 font-mono text-xs text-[#2f2d28] sm:text-sm">{JSON.stringify(detail?.trace?.assistant_preview || trace.assistant_preview || detail?.messages?.slice(-1)?.[0]?.content || {}, null, 2)}</pre>

                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Token usage</h4>
                <div className="grid grid-cols-1 gap-2 text-sm text-[#6f685e] sm:grid-cols-2">
                  <Metric label="Prompt" value={String(trace.prompt_tokens ?? 0)} />
                  <Metric label="Completion" value={String(trace.completion_tokens ?? 0)} />
                </div>

                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Raw payloads</h4>
                <pre className="max-h-44 overflow-auto rounded-lg border bg-[#fbfbfb] p-3 font-mono text-xs text-[#2f2d28] sm:text-sm">{JSON.stringify({ request: detail?.trace?.raw_request_json || trace.raw_request_json, response: detail?.trace?.raw_response_json || trace.raw_response_json }, null, 2)}</pre>

                <h4 className="text-xs uppercase tracking-[0.14em] text-[#8c8478]">Charts</h4>
                <details className="rounded-xl border border-[#e7dfcf] bg-[#fbfaf6] px-3 py-2">
                  <summary className="cursor-pointer list-none text-xs uppercase tracking-[0.14em] text-[#8c8478]">Sparkline view</summary>
                  <div className="mt-2 space-y-3">
                    <Line label="Latency (last)" value={`${latencySamples.slice(-1)[0] ?? "-"} ms`} />
                    <div className="h-9 w-full rounded-md border bg-white p-1">
                      <Sparkline data={latencySamples} width={220} height={36} stroke="#6f685e" />
                    </div>
                    <Line label="Throughput (chunks)" value={String(throughputSamples.slice(-1)[0] ?? "-")} />
                    <div className="h-9 w-full rounded-md border bg-white p-1">
                      <Sparkline data={throughputSamples} width={220} height={36} stroke="#4b5563" />
                    </div>
                  </div>
                </details>

                <div className="mt-2 flex items-center justify-between">
                  <div className="text-sm text-[#6f685e]">Estimated cost</div>
                  <div className="font-medium text-[#2f2d28]">{cost}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function PreviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e9e2d3] bg-[#faf8f0] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[#8c8478]">{label}</div>
      <div className="mt-1 line-clamp-3 text-sm text-[#2f2d28]">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e9e2d3] bg-[#faf8f0] px-3 py-2">
      <div className="text-xs text-[#8c8478]">{label}</div>
      <div className="mt-1 font-medium text-[#2f2d28]">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e7dfcf] bg-[#fbfaf6] px-3 py-2">
      <div className="truncate text-[10px] uppercase tracking-[0.16em] text-[#8c8478]">{label}</div>
      <div className="mt-1 truncate font-medium text-[#2f2d28]">{value}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-xs text-[#8c8478]">{label}</div>
      <div className="text-xs text-[#6f685e]">{value}</div>
    </div>
  );
}
