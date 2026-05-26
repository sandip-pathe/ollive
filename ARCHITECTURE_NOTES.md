## Ingestion Flow

1. Client submits a request through the Next.js web UI.
2. The web UI invokes the Python SDK to call the LLM provider.
3. The SDK writes a log message to Redis for fast buffering.
4. An SDK shipper batches buffered logs and posts to the FastAPI ingestion endpoint.
5. FastAPI validates payload schema and required fields.
6. FastAPI inserts validated records into Postgres within a transaction.
7. FastAPI publishes an enrichment job to Redis for the worker.
8. A Python worker consumes the Redis queue and enriches records.
9. The worker updates `enrichments` and marks records complete.

## Logging Strategy

- Log raw `prompt` and `response` at ingestion time for auditability.
- Log model parameters and token counts for analytics and cost tracking.
- Emit trace-level events for SDK errors and retry attempts.
- Ship logs asynchronously from SDK to avoid blocking LLM response paths.
- Batch logs at the shipper to trade lower request volume for marginal latency.

## Scaling Considerations

- Postgres write throughput can bottleneck ingestion; add time-based partitioning and bulk inserts.
- Redis memory can saturate under bursts; enforce TTLs and employ maxmemory policies.
- Ingestion API CPU or I/O can spike; scale FastAPI with multiple ASGI workers behind a load balancer.

## Failure Handling

- If the ingestion API is down, the SDK retries with exponential backoff and local batching.
- If Redis rejects writes, the SDK falls back to synchronous POST to the ingestion API.
- If Postgres write fails, FastAPI records the failure and publishes the event to a retry queue.
- If the enrichment worker crashes, Redis retains queued jobs for later consumption.
- Assume no perfect delivery; design for eventual consistency and idempotent writes.