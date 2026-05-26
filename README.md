## Demo

Hosted demo: [ollive-insure.vercel.app](https://ollive-insure.vercel.app/)

Use the invite code shared with you separately to get past the landing page.

1. Enter the invite code on the landing page.
2. Start a conversation, then send 2-3 messages to test multi-turn context.
3. Press the Inspect button in the top right to see the ingestion and trace views.
4. Open DevTools, go to the Network tab, and filter by `api/` to watch requests in real time.

Implementation references:
- [docker-compose.yml](./docker-compose.yml)
- [SDK log helper](./packages/llm_sdk/ingest.py)
- [Streaming wrapper](./packages/llm_sdk/openai_stream.py)
- [FastAPI app bootstrap](./apps/api/app/main.py)
- [Chat, auth, metrics, and trace routes](./apps/api/app/routes.py)
- [Trace runtime](./apps/api/app/trace_runtime.py)
- [DB schema + migrations](./packages/database/schema.sql)


## Setup

1. Clone the repository: `git clone https://github.com/your-org/ollive.git`.
2. Change to the project folder: `cd ollive`.
3. Copy the example env: `cp .env.example .env`.
4. Set `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `AUTH_INVITE_CODE`, `AUTH_SESSION_SECRET`, and `MAX_CALLS_PER_USER` in `.env`.
5. Build and start services: `docker compose up -d --build`.
6. Apply the schema: `cat packages/database/schema.sql | docker compose exec -T postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}`.
7. Start the web development server: `cd apps/web && npm install && npm run dev`.

For the demo login, use the invite code you set in `AUTH_INVITE_CODE`.

## Architecture Overview

The system is split between a Next.js frontend and a FastAPI backend. The browser talks to the API for auth, conversations, streaming chat, traces, and metrics. The backend streams model output through [packages/llm_sdk/openai_stream.py](./packages/llm_sdk/openai_stream.py), redacts content, writes messages, traces, inference logs, and events to Postgres, and serves the inspect dashboard. [packages/llm_sdk/ingest.py](./packages/llm_sdk/ingest.py) is the fire-and-forget HTTP helper for SDK-style log emission.

[read architecture notes](./ARCHITECTURE_NOTES.md)

## Local URLs

- UI: http://localhost:3000
- API docs: http://localhost:8001/docs

## Schema Design

- `users` - `id`, `display_name`, `llm_call_count`, `created_at` - auth records plus the per-user hard cap counter.
- `conversations` - `id`, `actor_id`, `title`, `status`, `metadata`, `created_at`, `updated_at` - one chat thread per user.
- `messages` - `id`, `conversation_id`, `role`, `content`, `content_redacted`, `tokens`, `metadata`, `created_at` - stored chat turns.
- `traces` - `trace_id`, `conversation_id`, `message_id`, `session_id`, `provider`, `model`, `started_at`, `completed_at`, `latency_ms`, `ttft_ms`, `stream_duration_ms`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `estimated_cost_usd`, `status`, `raw_request_json`, `raw_response_json`, `created_at` - stream-level telemetry.
- `trace_events` - `id`, `trace_id`, `type`, `timestamp`, `duration_ms`, `payload` - live events from the chat stream.
- `inference_logs` - `id`, `trace_id`, `conversation_id`, `message_id`, `provider`, `model`, `start_ts`, `end_ts`, `latency_ms`, `tokens_in`, `tokens_out`, `status`, `error`, `redacted_input_preview`, `redacted_output_preview`, `raw_payload`, `created_at` - ingestion-friendly log records.
- `extracted_metadata` - `id`, `inference_log_id`, `key`, `value`, `created_at` - queryable key/value metadata.
- `memories` - `id`, `subject_id`, `type`, `summary`, `vector`, `source_log_id`, `created_at`, `updated_at` - optional future memory layer.

## Tradeoffs

- Use Postgres for durable logs - provides ACID and SQL analytics - increases operational complexity.
- Use Redis for transient buffering - enables fast ingestion and backpressure smoothing - increases memory requirements.
- Use FastAPI for ingestion endpoints - provides async I/O and Python typing - requires ASGI configuration.
- Use a dedicated Python worker process for enrichment - enables retries and heavy processing off the main path - adds deployment complexity.
- Batch writes on ingestion to reduce Postgres load - lowers write amplification - increases ingestion latency.

## What I'd Improve

- Add time-based partitioning on `inference_logs` to speed large-table queries.
- Add column-level encryption for `prompt` and `response` to reduce data exposure risks.
- Add Kafka for the ingestion stream to improve throughput and durability under peak load.
- Implement SDK batching with compression to reduce network usage and API calls.
- Add Prometheus metrics and Grafana dashboards for ingestion latency and queue depth.
