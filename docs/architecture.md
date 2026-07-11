# System Architecture

Ollive is an experimental monorepo reference implementation with a Next.js frontend, FastAPI backend, Postgres database, Redis queue, SDK wrapper, and enrichment worker.

The current system is run-first for risk evaluation: JSON ingest, the TypeScript
SDK, and projected chat traces normalize into an `AgentRun`. Vendor-specific
adapters are design notes only and do not ship in v0.1.

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

## AgentRun Data Flow

```text
Customer agent app
  -> Ollive TypeScript SDK / JSON ingest
  -> collector API
  -> AgentRun normalizer
  -> run store
  -> risk engine
  -> evidence packet generator
  -> dashboard, review, export
```

The current chat path projects its trace evidence into the same persisted
AgentRun model used by external applications.

## AgentRun Model

`AgentRun` is the canonical observability unit. It represents one attempt by an AI agent to complete a task. A run can contain user input, model calls, tool calls, retrieval, memory access, policy checks, human handoff, side effects, runtime failures, and final outcome.

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

Traces are source evidence inside an `AgentRun`. They remain useful and inspectable, but they are not the only ingestion shape.

## Insurance Evidence Model

The insurance layer extends generic LLM observability with three tables:

- `agent_policy_rules` - policy rules in the active `agentic_insurance_v1` pack.
- `agent_risk_events` - risk findings with severity, status, confidence, owner, evidence, and remediation.
- `evidence_packets` - packet status, insurability posture, summary, audit trail, and failure nodes.

The packet exposes these heuristic posture labels:

- `insurable` - no material risk found from available trace evidence.
- `needs_review` - medium/high risk or low-confidence risk needs human review.
- `blocked` - critical authority or liability risk should block insurability.
- `unknown` - the packet is pending, errored, or lacks enough evidence.

Every packet also carries machine-readable experimental assessment metadata.
Posture is review support only and is not a safety, compliance, underwriting, or
insurance decision.

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
- `POST /v1/runs`
- `GET /v1/runs`
- `GET /v1/runs/{run_id}`
- `POST /v1/runs/{run_id}/events`
- `GET /v1/runs/{run_id}/evidence-packet`
- `POST /v1/runs/{run_id}/evidence-packet/recompute`

Auth endpoints:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

## Local Ports

- Web: `localhost:3000`
- API: `localhost:8001`
- Postgres: `localhost:5433`
- Redis: `localhost:6380`

## Current Constraints

- Trace packet generation is an API background task, not a durable Redis job.
- JSON and first-party TypeScript SDK AgentRun ingestion are shipped.
- `AgentRun` is persisted through `agent_runs`, `agent_run_steps`, and `agent_run_sources`.
- The first collector API accepts JSON AgentRun payloads under `/v1`.
- LangSmith, OpenTelemetry, Python, and other adapters are not implemented.
- Docker Compose is a local, single-trust-domain reference stack only.
- One optional collector token is shared across ingest clients; `tenant_id` is
  metadata, not an authorization boundary.
- Raw payloads and optional BYOK AI review cross sensitive-data boundaries.
  Production adaptation requires minimization, retention, access controls, and
  independent security review.
- No supported in-place migration path is provided for v0.1.

## Target Architecture References

- [OSS risk layer product thesis](./product/oss-risk-layer.md)
- [Agent risk layer architecture](./architecture/agent-risk-layer.md)
- [AgentRun schema](./architecture/agent-run-schema.md)
- [JSON AgentRun ingest](./integrations/json-ingest.md)
- [OSS milestone roadmap](./roadmap/oss-milestones.md)
