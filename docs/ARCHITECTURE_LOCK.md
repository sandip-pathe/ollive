# ARCHITECTURE LOCK — Ollive

Date: 2026-05-24

This file records the architecture and implementation choices agreed and locked by the project owner. Any change to these choices requires explicit approval.

Core choices
- Provider: OpenAI (primary)
- Streaming: enabled (use OpenAI streaming APIs)
- Backend: FastAPI (Python)
- Event bus / queue: Redis (for ingestion/enrichment/workers)
- Database: PostgreSQL
- Local orchestration: Docker Compose (one-command dev)
- Repo layout: monorepo with `apps/web`, `apps/api`, `packages/llm-sdk`, `packages/shared`, `packages/database`, `docs/`

PII Redaction (MVP)
- Primary method: deterministic regex-based redaction for emails, phones, credit-cards, SSNs, IPs, and obvious tokens.
- Optional secondary pass: ML/NLP NER (spaCy or OpenAI extract) toggled per environment.
- Storage policy: store only irreversible hashes for audit by default; reversible mapping only if explicitly enabled and documented.
- Memory gating: memory writes must pass redaction and require explicit consent flag.

Memory layer
- `MemoryAdapter` interface in backend.
- Default implementation: local `memories` table (no-op for now).
- Swap-in: Mem0-style remote implementation using adapter.

API surface (locked)
- POST /api/conversations — start conversation
- POST /api/conversations/:id/messages — send message (streams assistant response)
- GET /api/conversations — list conversations
- GET /api/conversations/:id — conversation detail + messages
- POST /api/conversations/:id/cancel — cancel in-flight request
- POST /api/ingest/logs — ingestion endpoint
- GET /api/metrics — simple metrics for dashboards

UI scope (locked)
- Cancel a conversation
- List conversations
- Resume a conversation

Operational notes
- SDK (`packages/llm-sdk`) will emit inference logs to ingestion API asynchronously; failures must not block chat delivery.
- Ingestion should validate and persist `inference_logs` and `extracted_metadata`; enrichment runs via Redis workers.
- Logging payload includes provider, model, timestamps, latency, token usage (if available), status, redacted previews, session/conversation id.

Locked status
- These choices are locked. To change any of the above, reply here with desired changes and approve them explicitly.

