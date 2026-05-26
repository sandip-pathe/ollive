## Setup

1. Clone the repository: `git clone https://github.com/your-org/ollive.git`.
2. Change to project folder: `cd ollive`.
3. Copy the example env: `cp .env.example .env`.
4. Set `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, and `SECRET_KEY` in `.env`.
5. Build and start services: `docker compose up -d --build`.
6. Run migrations: `docker compose run --rm -v %cd%/packages/database:/schema postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -f /schema/schema.sql`.
7. Start web development server: `cd apps/web && npm install && npm run dev`.

## Architecture Overview

The system captures LLM inference metadata in near real-time using an async SDK, a Redis buffer, and a FastAPI ingestion pipeline.
Logs are enriched asynchronously by a worker process and stored in Postgres for querying.

## Local URLs

- UI: http://localhost:3000
- API docs: http://localhost:8001/docs

## Schema Design

- `inference_logs` — `id`, `request_id`, `user_id`, `prompt`, `response`, `created_at` — stores raw inference payloads for audits and queries.
- `prompt_metadata` — `id`, `inference_id`, `model`, `temperature`, `tokens` — normalizes model parameters for efficient analytics.
- `enrichments` — `id`, `inference_id`, `type`, `data`, `status` — stores derived signals and enrichment results for later joins.
- `users` — `id`, `external_id`, `email`, `created_at` — links logs to identity and supports multi-tenant queries.

## Tradeoffs

- Use Postgres for durable logs — provides ACID and SQL analytics — increases operational complexity.
- Use Redis for transient buffering — enables fast ingestion and backpressure smoothing — increases memory requirements.
- Use FastAPI for ingestion endpoints — provides async I/O and Python typing — requires ASGI configuration.
- Use a dedicated Python worker process for enrichment — enables retries and heavy processing off main path — adds deployment complexity.
- Batch writes on ingestion to reduce Postgres load — lowers write amplification — increases ingestion latency.

## What I'd Improve

- Add time-based partitioning on `inference_logs` to speed large-table queries.
- Add column-level encryption for `prompt` and `response` to reduce data exposure risks.
- Add Kafka for the ingestion stream to improve throughput and durability under peak load.
- Implement SDK batching with compression to reduce network usage and API calls.
- Add Prometheus metrics and Grafana dashboards for ingestion latency and queue depth.
# Ollive (scaffold)

Scaffold for the Ollive assignment. See `docs/` for architecture and schema notes.

Run the dev environment:

```bash
./scripts/start-dev.sh
```
