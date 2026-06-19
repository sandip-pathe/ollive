# Architecture Notes

## Ingestion Flow

1. A user starts or resumes a conversation in the Next.js UI.
2. The browser sends chat requests to the FastAPI backend at `/api/conversations/{conversation_id}/messages/stream`.
3. The backend creates a trace, stores the user message, redacts previews, and streams tokens through `packages/llm_sdk/openai_stream.py`.
4. The backend writes `messages`, `traces`, `trace_events`, and `inference_logs` while the stream runs.
5. On success, cancellation, timeout, or error, the backend creates or updates an evidence packet for the trace.
6. The risk classifier reads the trace plus trace events and writes `agent_risk_events` and `evidence_packets`.
7. The inspect UI reads metrics, traces, trace events, raw payloads, and evidence packet data from the API.
8. `packages/llm_sdk/ingest.py` remains the lightweight fire-and-forget helper for SDK-style log emission.

## Logging Strategy

- Log redacted input and output previews in normal UI paths.
- Capture provider, model, timestamps, latency, first-token time, stream duration, token estimates, cost estimate, status, error text, and conversation/session IDs.
- Emit trace events for request start, first token, chunk delivery, completion, warnings, cancellation, timeout, and errors.
- Store raw request/response JSON for inspection where available.
- Keep SDK-side log emission asynchronous so logging failures do not block chat delivery.
- Store observability data in Postgres so the inspect dashboard queries live product state.

## Agentic Insurance Layer

The insurance layer is intentionally trace-first. A packet is only as strong as the evidence available in the run.

- `agent_policy_rules` stores the active policy pack, currently `agentic_insurance_v1`.
- `agent_risk_events` stores risk findings with severity, status, confidence, owner, evidence quote, evidence source, and remediation.
- `evidence_packets` stores packet status, insurability posture, summary, audit trail, and failure nodes.
- `apps/api/app/risk_classifier.py` owns deterministic classification and packet generation.
- `apps/web/components/inspect/evidence-packet.tsx` renders the packet in the inspect panel.

The MVP classifier currently detects risky promises, coverage or regulated advice, PII exposure, missed escalation, unsupported claims, unsafe suggestions, runtime failure nodes, and authority boundary breaches.

## Scaling Considerations

- Postgres write throughput can bottleneck ingestion; add time-based partitioning and bulk inserts before high-volume use.
- Redis memory can saturate under bursts; enforce TTLs and maxmemory policies where queued work is used.
- The current evidence packet scheduler runs in-process from the API. For production, move packet generation to a durable worker queue with retries and idempotency.
- The inspect dashboard should continue to work when traces are sparse, incomplete, or pending.
- Raw payload retention needs an explicit policy before production use.

## Failure Handling

- If `OPENAI_API_KEY` is missing, the streaming wrapper returns a stubbed response so the demo still runs.
- If the ingestion API is down, the SDK helper swallows the error and chat delivery continues.
- If evidence packet generation fails, the packet is marked `error` and can be recomputed from the inspect UI.
- If the browser cannot send headers for `EventSource`, the backend accepts token-in-query fallback for SSE.
- If trace events are missing or a terminal event is absent, the packet records a workflow failure node instead of pretending the run is clean.

## Production Gaps

- External agent SDK ingestion is not yet first-class.
- Evidence packet generation should move from in-process background task to durable queue.
- Auth bypass must be disabled outside local development.
- Multi-tenant isolation, retention policy, audit exports, alerting, and review queues are still needed.
- End-to-end tests should cover streaming, cancellation, packet generation, and recompute behavior.
