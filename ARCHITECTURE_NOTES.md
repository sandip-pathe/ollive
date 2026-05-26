## Ingestion Flow

1. A user starts a conversation in the Next.js UI.
2. The browser sends chat requests to the FastAPI backend at `/api/conversations/{conv_id}/messages/stream`.
3. The backend fetches recent context from Postgres, redacts sensitive content, and streams tokens through [packages/llm_sdk/openai_stream.py](./packages/llm_sdk/openai_stream.py).
4. The backend writes `messages`, `traces`, `trace_events`, and `inference_logs` records as the conversation runs.
5. The inspect UI reads `/api/metrics/overview`, `/api/traces`, and `/api/traces/{trace_id}/events/stream` to render live observability.
6. [packages/llm_sdk/ingest.py](./packages/llm_sdk/ingest.py) is the lightweight fire-and-forget HTTP helper for SDK-style log emission.

## Logging Strategy

- Log redacted input and output previews rather than full raw prompts in the normal path.
- Capture provider, model, latency, token estimates, status, error text, and conversation/session IDs.
- Emit trace events for request start, first token, chunk delivery, completion, warnings, and errors.
- Keep the SDK-side log helper asynchronous so logging failures do not block the chat response.
- Store observability data in Postgres so the inspect dashboard can query live product state.

## Scaling Considerations

- Postgres write throughput can bottleneck ingestion; add time-based partitioning and bulk inserts.
- Redis memory can saturate under bursts; enforce TTLs and maxmemory policies where queued work is used.
- Ingestion API CPU or I/O can spike; scale FastAPI with multiple ASGI workers behind a load balancer.
- The inspect dashboard should continue to work even when traces are sparse, because empty-state queries are cheap.

## Failure Handling

- If the model key is missing, the streaming wrapper falls back to a stub response so the demo still runs.
- If the ingestion API is down, the SDK helper swallows the error and chat delivery continues.
- If Postgres write fails, the request should surface the failure in the trace and avoid hiding it as success.
- If the browser cannot send headers for EventSource, the backend accepts token-in-query fallback for SSE.
- Assume no perfect delivery; design for eventual consistency and idempotent writes.
