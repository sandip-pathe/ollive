# Ollive

Ollive is an agentic insurance observability prototype. It treats every chat run as an agent action, records the runtime trace, and turns that trace into an Agent Risk & Insurability Evidence Packet.

The product thesis is simple: if an insurance company is willing to insure AI-agent actions inside customer workflows, it needs more than token counts and latency charts. It needs evidence of trust, auditability, accountability, authority boundaries, failure nodes, and remediation ownership.

Hosted demo: [ollive-insure.vercel.app](https://ollive-insure.vercel.app/)

## What It Does

- Streams multi-turn chat through a FastAPI backend and OpenAI-compatible wrapper.
- Persists conversations, messages, traces, trace events, inference logs, and extracted metadata in Postgres.
- Shows live inspection for request lifecycle, latency, token/cost evidence, raw request/response payloads, and event timelines.
- Generates an Agent Risk & Insurability Evidence Packet for a selected trace.
- Classifies agentic risk with the `agentic_insurance_v1` policy pack.
- Flags risky promises, coverage/regulated advice, PII exposure, missed escalation, unsupported claims, unsafe suggestions, runtime failure nodes, and authority boundary breaches.
- Assigns owner and remediation for each risk event.
- Renders chat messages as rich Markdown instead of raw Markdown text.
- Runs locally with Docker Compose, including the web app, API, Postgres, Redis, and enrichment worker.

## Screenshots

### Chat Workspace

![Ollive chat workspace](./docs/assets/ollive-chat-workspace.png)

### Trace Evidence Console

![Ollive trace evidence console](./docs/assets/ollive-inspect-console.png)

### Agent Risk & Insurability Evidence Packet

![Ollive evidence packet](./docs/assets/ollive-evidence-packet.png)

## Local Setup

1. Copy the example environment file.

   ```bash
   cp .env.example .env
   ```

2. Set `OPENAI_API_KEY` in `.env` if you want real model responses. Without it, the backend returns a stubbed streaming response so the app still runs.

3. Start the full local stack.

   ```bash
   docker compose up -d --build
   ```

4. Open the app.

   - Web: [http://localhost:3000](http://localhost:3000)
   - API health: [http://localhost:8001/health](http://localhost:8001/health)
   - API docs: [http://localhost:8001/docs](http://localhost:8001/docs)

The Docker setup enables local auth bypass by default with `AUTH_BYPASS=true` and `NEXT_PUBLIC_AUTH_BYPASS=true`. For shared or production-like environments, disable bypass and set a real `AUTH_INVITE_CODE` plus a long random `AUTH_SESSION_SECRET`.

## Demo Flow

1. Start a new chat and send a few representative prompts.
2. Open the Inspect panel.
3. Select a trace from the trace evidence console.
4. Review the live trace details and event timeline.
5. Open the evidence packet tab to see insurability posture, risk events, owner, remediation, audit trail, and failure nodes.
6. Use Recompute after a trace changes or after backfilling trace events.

## Core Endpoints

- `POST /api/auth/invite` - create a local session from an invite code.
- `GET /api/auth/session` - read the current session.
- `POST /api/conversations` - create a conversation.
- `GET /api/conversations` - list conversations.
- `GET /api/conversations/{id}` - get conversation detail and messages.
- `POST /api/conversations/{id}/messages/stream` - stream a chat response and write trace evidence.
- `POST /api/conversations/{id}/cancel` - cancel or pause an active conversation.
- `POST /api/ingest/logs` - accept SDK-style inference logs.
- `GET /api/metrics/overview` - read dashboard metrics.
- `GET /api/traces` - list traces.
- `GET /api/traces/{trace_id}` - read trace detail.
- `GET /api/traces/{trace_id}/events/stream` - stream trace events.
- `GET /api/traces/{trace_id}/evidence-packet` - read or lazily generate an evidence packet.
- `POST /api/traces/{trace_id}/evidence-packet/recompute` - recompute risk events and packet summary.

## Architecture

Ollive is a small monorepo:

- `apps/web` - Next.js app router UI for chat, auth, and inspect views.
- `apps/api` - FastAPI service for auth, chat streaming, ingestion, metrics, traces, and evidence packets.
- `packages/llm_sdk` - OpenAI streaming wrapper and non-blocking ingestion helper.
- `packages/shared` - redaction utilities and shared helpers.
- `packages/database` - SQL schema and database notes.
- `packages/worker` - Redis enrichment worker for metadata extraction.
- `docs` - architecture, product, schema, tradeoff, and readiness notes.

The trace flow is:

```text
chat request
  -> FastAPI stream endpoint
  -> OpenAI wrapper or stubbed stream
  -> messages + traces + trace_events + inference_logs
  -> evidence packet scheduler
  -> risk classifier
  -> agent_risk_events + evidence_packets
  -> inspect UI
```

Read more:

- [Architecture notes](./ARCHITECTURE_NOTES.md)
- [System architecture](./docs/architecture.md)
- [Agentic insurance observability](./docs/agentic-insurance-observability.md)
- [Schema notes](./docs/schema.md)
- [Tradeoffs](./docs/tradeoffs.md)
- [Ship readiness](./docs/ship-readiness.md)

## Database Tables

- `users` - invite/session identity plus local LLM call counts.
- `conversations` - chat threads.
- `messages` - user and assistant turns.
- `traces` - request-level runtime telemetry.
- `trace_events` - lifecycle and streaming events for a trace.
- `inference_logs` - SDK-friendly request logs.
- `extracted_metadata` - worker-extracted key/value metadata.
- `agent_policy_rules` - the active insurance risk policy pack.
- `agent_risk_events` - trace-level risk findings with severity, owner, evidence, and remediation.
- `evidence_packets` - packet status, insurability posture, summary, audit trail, and failure nodes.
- `memories` - optional future memory layer.

## Verification

Useful checks before pushing:

```bash
python -m py_compile apps/api/app/auth.py apps/api/app/db.py apps/api/app/routes.py apps/api/app/trace_runtime.py apps/api/app/risk_classifier.py
```

```bash
cd apps/web
npx tsc --noEmit --pretty false
```

```bash
cd apps/web
npx eslint components/chat/markdown-message.tsx components/chat/assistant-message.tsx components/chat/user-message.tsx components/chat/chat-layout.tsx components/inspect/inspect-panel.tsx components/inspect/inspect-tabs.tsx components/inspect/evidence-packet.tsx components/inspect/ops-review.tsx components/auth/auth-gate.tsx app/lib/api.ts app/lib/auth.ts
```

```bash
git diff --check
docker compose ps
```

## Shipping Position

You can call this an observability tool now, but be precise: it is an agentic insurance observability MVP for chat-as-agent workflows. It has real trace capture, persistence, risk classification, evidence packets, and an inspect UI.

Do not call it a production LangSmith replacement yet. Before production, it still needs SDK ingestion for external agents, multi-tenant controls, retention policy, alerting, evals, review workflows, stronger test coverage, and deploy hardening. See [ship readiness](./docs/ship-readiness.md).
