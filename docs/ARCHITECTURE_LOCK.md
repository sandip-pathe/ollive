# Architecture Lock - Ollive

Date: 2026-05-24

This file records the architecture and implementation choices agreed and locked by the project owner. Any change to these choices requires explicit approval.

## Core Choices

- Provider: OpenAI primary.
- Streaming: enabled with OpenAI streaming APIs.
- Backend: FastAPI in Python.
- Event bus / queue: Redis for ingestion, enrichment, and future background workers.
- Database: PostgreSQL.
- Local orchestration: Docker Compose.
- Repo layout: monorepo with `apps/web`, `apps/api`, `packages/llm_sdk`, `packages/shared`, `packages/database`, `packages/worker`, and `docs`.

## PII Redaction

- Primary method: deterministic regex-based redaction for emails, phones, credit cards, SSNs, IPs, and obvious tokens.
- Optional secondary pass: ML/NLP NER or LLM extraction toggled per environment.
- Storage policy: prefer redacted previews in normal paths. Raw payload access needs explicit production retention and access rules.
- Memory gating: memory writes must pass redaction and require an explicit consent flag.

## Memory Layer

- `MemoryAdapter` remains a future backend interface.
- Default implementation: local `memories` table.
- Swap-in option: remote memory provider through an adapter.

## API Surface

- `POST /api/conversations` - start conversation.
- `GET /api/conversations` - list conversations.
- `GET /api/conversations/:id` - conversation detail plus messages.
- `POST /api/conversations/:id/messages/stream` - send message and stream assistant response.
- `POST /api/conversations/:id/cancel` - cancel in-flight request.
- `POST /api/ingest/logs` - ingestion endpoint.
- `GET /api/metrics/overview` - dashboard metrics.
- `GET /api/traces` - list trace records.
- `GET /api/traces/:trace_id` - trace detail.
- `GET /api/traces/:trace_id/events/stream` - live trace events.
- `GET /api/traces/:trace_id/evidence-packet` - agent insurance evidence packet.
- `POST /api/traces/:trace_id/evidence-packet/recompute` - recompute packet.

## UI Scope

- Start, list, resume, pause, and cancel conversations.
- Inspect runtime traces, metrics, raw payloads, and event timelines.
- Render chat content as Markdown.
- Show Agent Risk & Insurability Evidence Packets with posture, risk events, owners, remediations, audit trail, and failure nodes.

## Operational Notes

- SDK (`packages/llm_sdk`) emits inference logs to the ingestion API asynchronously; failures must not block chat delivery.
- Ingestion validates and persists `inference_logs` and `extracted_metadata`; enrichment runs through the Redis worker.
- Logging payload includes provider, model, timestamps, latency, token usage when available, status, redacted previews, session ID, conversation ID, and trace ID.
- Agentic insurance evidence packets are generated from trace, event, and message evidence. Incomplete runtime evidence must be surfaced as a failure node.

## Locked Status

These choices are locked. To change any of the above, reply with the desired changes and approve them explicitly.
