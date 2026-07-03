# System Architecture

Ollive is a monorepo with a Next.js frontend, FastAPI backend, Postgres database, Redis queue, SDK wrapper, and enrichment worker.

The current shipped system is trace-first because chat-as-agent is the first working integration. The target architecture is run-first: every chat trace, SDK event, adapter import, or JSON payload should normalize into an `AgentRun`.

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

## Current Data Flow

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

## Target Data Flow

```text
Customer agent app
  -> Ollive SDK / JSON ingest / observability adapter
  -> collector API
  -> AgentRun normalizer
  -> run store
  -> risk engine
  -> evidence packet generator
  -> dashboard, review, export
```

The current chat path should eventually feed the same normalizer as external agent applications.

## AgentRun Model

`AgentRun` is the canonical future observability unit. It represents one attempt by an AI agent to complete a task. A run can contain user input, model calls, tool calls, retrieval, memory access, policy checks, human handoff, side effects, runtime failures, and final outcome.

See [AgentRun schema](./architecture/agent-run-schema.md).

Current chat traces map into `AgentRun` as the first integration:

| Current concept | AgentRun concept |
| --- | --- |
| `traces.trace_id` | run ID or source evidence ID |
| conversation + message | task/thread evidence |
| OpenAI wrapper call | model call step |
| `trace_events` | runtime event steps |
| `agent_risk_events` | generated risk findings |
| `evidence_packets` | generated run packet |

## Trace Model

A trace is the current shipped unit of observability. It represents one model run inside one conversation.

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

In the target architecture, traces are source evidence inside an `AgentRun`. They remain useful and inspectable, but they are not the only ingestion shape.

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
- `AgentRun` is documented but not yet persisted as its own database table.
- The collector API for external runs is not yet implemented.
- Local Docker auth bypass is useful for development and must be disabled for shared environments.
- Raw payload inspection is valuable for proof of work, but production use needs a retention and access-control policy.

## Target Architecture References

- [OSS risk layer product thesis](./product/oss-risk-layer.md)
- [Agent risk layer architecture](./architecture/agent-risk-layer.md)
- [AgentRun schema](./architecture/agent-run-schema.md)
- [OSS milestone roadmap](./roadmap/oss-milestones.md)
