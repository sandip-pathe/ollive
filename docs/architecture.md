# System Architecture

Ollive is a monorepo with a Next.js frontend, FastAPI backend, Postgres database, Redis queue, SDK wrapper, and enrichment worker.

## Runtime Services

| Service | Path | Responsibility |
| --- | --- | --- |
| Web | `apps/web` | Chat UI, local auth gate, inspect panel, trace views, evidence packet UI |
| API | `apps/api` | Auth, conversations, streaming chat, ingestion, metrics, trace runtime, packet generation |
| Database | `packages/database/schema.sql` | Durable chat, trace, log, risk, and evidence packet tables |
| SDK wrapper | `packages/llm_sdk` | OpenAI streaming and fire-and-forget ingestion helper |
| Worker | `packages/worker/enricher.py` | Redis-backed metadata extraction from inference logs |
| Shared | `packages/shared` | Redaction and shared helpers |

Local Docker Compose starts `web`, `api`, `postgres`, `redis`, and `worker`.

## Data Flow

```text
Browser chat UI
  -> POST /api/conversations/{id}/messages/stream
  -> API creates user message + trace
  -> OpenAI streaming wrapper emits trace events
  -> API persists assistant message + inference log
  -> evidence packet is marked pending
  -> risk classifier reads trace + events
  -> agent_risk_events and evidence_packets are written
  -> inspect UI renders trace detail + packet
```

## Trace Model

A trace is the unit of observability. It represents one model run inside one conversation.

The trace records:

- provider and model
- session, conversation, and message IDs
- start/completion timestamps
- latency, first-token time, stream duration
- prompt, completion, and total token estimates
- cost estimate
- stream chunk count
- temperature, top-p, max tokens, seed, retry count
- status and interruption reason
- redacted user and assistant previews
- raw request and response payloads when available

Trace events add runtime lifecycle detail such as first token, chunks, completion, warning, cancellation, timeout, or error.

## Insurance Evidence Model

The insurance layer extends generic LLM observability with three tables:

- `agent_policy_rules` - policy rules in the active `agentic_insurance_v1` pack.
- `agent_risk_events` - risk findings with severity, status, confidence, owner, evidence, and remediation.
- `evidence_packets` - packet status, insurability posture, summary, audit trail, and failure nodes.

The packet posture can be:

- `insurable` - no material risk found from available trace evidence.
- `needs_review` - medium/high risk or low-confidence risk needs human review.
- `blocked` - critical authority or liability risk should block insurability.
- `unknown` - the packet is pending, errored, or lacks enough evidence.

## API Surface

Core product endpoints:

- `POST /api/conversations`
- `GET /api/conversations`
- `GET /api/conversations/{conversation_id}`
- `POST /api/conversations/{conversation_id}/messages/stream`
- `POST /api/conversations/{conversation_id}/cancel`
- `POST /api/ingest/logs`
- `GET /api/metrics/overview`
- `GET /api/traces`
- `GET /api/traces/{trace_id}`
- `GET /api/traces/{trace_id}/events/stream`
- `GET /api/traces/{trace_id}/evidence-packet`
- `POST /api/traces/{trace_id}/evidence-packet/recompute`

Auth endpoints:

- `POST /api/auth/invite`
- `GET /api/auth/session`
- `POST /api/auth/logout`

## Local Ports

- Web: `localhost:3000`
- API: `localhost:8001`
- Postgres: `localhost:5433`
- Redis: `localhost:6380`

## Current Constraints

- Evidence packet generation is currently an API background task, not a durable Redis job.
- The product observes the built-in chat-as-agent path first; external agent SDK ingestion is a next step.
- Local Docker auth bypass is useful for development and must be disabled for shared environments.
- Raw payload inspection is valuable for proof of work, but production use needs a retention and access-control policy.
