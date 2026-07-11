# Ollive

Ollive is an experimental, self-hosted reference implementation for evaluating
AI-agent runs as risk evidence.

It accepts Ollive-formatted `AgentRun` evidence, applies the deterministic
`agentic_insurance_v1` policy pack, and produces an inspectable evidence packet
with findings, missing evidence, failure nodes, owners, and remediation. The
built-in chat is the first example agent, not the product boundary.

The project explores a larger thesis: risk interpretation can become an
open-source layer above agent traces. That category claim is aspirational. The
current release is not a safety system, insurer, underwriting model, compliance
control, or production observability platform.

> **Experimental:** packet output is heuristic review support only. It is not a
> safety, compliance, insurance, or deployment decision.

## What It Does

Shipped in v0.1:

- Streams multi-turn chat through a FastAPI backend and OpenAI-compatible wrapper.
- Persists conversations, messages, traces, trace events, inference logs, and extracted metadata in Postgres.
- Accepts normalized `AgentRun` JSON through `/v1/runs`.
- Includes a first-party TypeScript SDK in `packages/ollive-js` for instrumenting agent backends.
- Shows live inspection for request lifecycle, latency, token/cost evidence, raw request/response payloads, and event timelines.
- Shows a run-first risk posture dashboard for AgentRuns, packets, failure nodes, and accountability owners.
- Generates an experimental Agent Risk Evidence Packet for a selected run or trace.
- Classifies agentic risk with the V2 `agentic_insurance_v1` policy pack.
- Optionally adds BYOK AI risk review findings with explicit provenance.
- Flags risky promises, coverage/regulated advice, PII exposure, missed escalation, unsupported claims, unsafe suggestions, runtime failure nodes, and authority boundary breaches.
- Assigns owner and remediation for each risk event.
- Renders chat messages as rich Markdown instead of raw Markdown text.
- Runs as a local/reference Docker Compose stack with the web app, API, Postgres, Redis, and enrichment worker.

Product model:

- `AgentRun` is the canonical observability object.
- Chat and the TypeScript SDK both normalize evidence into that model.
- JSON ingest is shipped. LangSmith and OpenTelemetry adapters are not shipped.
- Missing evidence is reported instead of treating an opaque run as safe.

## Instrument An Agent

The lowest-friction path is the JavaScript SDK:

```ts
import { createOlliveClient } from "@ollive/risk-layer";

const ollive = createOlliveClient({
  endpoint: process.env.OLLIVE_ENDPOINT ?? "http://localhost:8001",
  token: process.env.OLLIVE_INGEST_TOKEN,
  defaultAgent: {
    name: "claims-support-agent",
    environment: "local",
  },
  defaultAuthority: {
    scope: "informational_support",
    disallowed_actions: ["approve_claim", "deny_claim", "guarantee_payout"],
    requires_handoff: ["coverage_decision"],
  },
});

const run = await ollive.startRun({
  task: {
    type: "claim_question",
    input: "Will this claim be approved?",
  },
});

await run.modelCall({
  provider: "openai",
  model: "gpt-4o-mini",
  output: { text: "I can explain the review process, but cannot approve it." },
});

const result = await run.end({
  status: "success",
  summary: "Answered with process guidance only.",
  side_effects: [],
});

console.log(result.evidence_packet);
```

The collector generates the run-level evidence packet and risk findings from
that evidence.

## Screenshots

### Chat Workspace

![Ollive chat workspace](./docs/assets/ollive-chat-workspace.png)

### Trace Evidence Console

![Ollive trace evidence console](./docs/assets/ollive-inspect-console.png)

### Agent Risk Evidence Packet

![Ollive evidence packet](./docs/assets/ollive-evidence-packet.png)

## Local Setup

1. Copy the example environment file.

   ```bash
   cp .env.example .env
   ```

2. Set `OPENAI_API_KEY` in `.env` if you want real model responses. Without it, the backend returns a stubbed streaming response so the app still runs.

3. Start the local reference stack.

   ```bash
   docker compose up -d --build --wait
   ```

4. Open the app.

   - Web: [http://localhost:3000](http://localhost:3000)
   - API health: [http://localhost:8001/health](http://localhost:8001/health)
   - API docs: [http://localhost:8001/docs](http://localhost:8001/docs)

The Compose profile is for local development in one trusted environment. It
enables auth bypass by default and is not a production deployment profile.

## First Packet

With the stack running, send one risky AgentRun:

```bash
curl -X POST http://localhost:8001/v1/runs \
  -H "Content-Type: application/json" \
  -d '{"run_id":"run_readme_001","agent":{"name":"claims-agent","environment":"local"},"task":{"type":"claim_question","input":"Will my claim be approved?"},"authority":{"scope":"informational_support","disallowed_actions":["approve_claim","guarantee_payout"],"requires_handoff":["coverage_decision"]},"steps":[{"step_id":"model_1","type":"model_call","status":"success","output":{"text":"This claim is definitely approved and covered for sure."}}],"outcome":{"status":"success"},"evidence":{"redaction_applied":true}}'
```

The response contains `evidence_packet.packet.insurability_posture`, findings,
evidence gaps, and an `assessment.status` of `experimental`. Open
[http://localhost:3000/inspect](http://localhost:3000/inspect) to inspect it.

For an isolated release smoke that creates and removes its own volumes:

```bash
python scripts/smoke_reference_stack.py
```

## Demo Flow

1. Create an AgentRun through JSON ingest or the TypeScript SDK.
2. Open the Inspect panel and select the run.
3. Review posture, findings, evidence gaps, owner, remediation, and provenance.
4. Export the packet as JSON or recompute it after appending run evidence.
5. Use the chat workspace only when you want a built-in example agent.

## Core Endpoints

- `POST /api/auth/login` - create a local session from an invite code.
- `GET /api/auth/me` - read the current session.
- `POST /api/auth/logout` - end the current session.
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
- `POST /v1/runs` - ingest a normalized AgentRun JSON payload and generate a run-level evidence packet.
- `GET /v1/runs` - list normalized agent runs.
- `GET /v1/runs/{run_id}` - read one normalized agent run with steps and sources.
- `POST /v1/runs/{run_id}/events` - append AgentRun steps and recompute the evidence packet.
- `GET /v1/runs/{run_id}/evidence-packet` - read a run-level evidence packet.
- `POST /v1/runs/{run_id}/evidence-packet/recompute` - recompute a run-level evidence packet.

## Architecture

Ollive is a small monorepo:

- `apps/web` - Next.js app router UI for chat, auth, and inspect views.
- `apps/api` - FastAPI service for auth, chat streaming, ingestion, metrics, traces, and evidence packets.
- `packages/ollive-js` - TypeScript SDK for recording normalized agent runs.
- `packages/llm_sdk` - OpenAI streaming wrapper and non-blocking ingestion helper.
- `packages/shared` - redaction utilities and shared helpers.
- `packages/database` - SQL schema and database notes.
- `packages/worker` - Redis enrichment worker for metadata extraction.
- `docs` - architecture, product, schema, tradeoff, and readiness notes.

The current trace flow is:

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

The shipped AgentRun flow is:

```text
agent app
  -> Ollive TypeScript SDK / JSON ingest
  -> collector API
  -> normalized AgentRun
  -> risk engine
  -> evidence packet
  -> dashboard / export / review
```

No Ollive-hosted service is required. LangSmith and OpenTelemetry are possible
future evidence sources, but v0.1 does not ship those adapters.

Read more:

- [Architecture notes](./ARCHITECTURE_NOTES.md)
- [System architecture](./docs/architecture.md)
- [Agentic insurance observability](./docs/agentic-insurance-observability.md)
- [OSS risk layer product thesis](./docs/product/oss-risk-layer.md)
- [Agent risk layer architecture](./docs/architecture/agent-risk-layer.md)
- [AgentRun schema](./docs/architecture/agent-run-schema.md)
- [JSON AgentRun ingest](./docs/integrations/json-ingest.md)
- [JavaScript SDK integration](./docs/integrations/js-sdk.md)
- [Adapter strategy](./docs/integrations/adapters.md)
- [Risk Engine V2](./docs/risk/risk-engine-v2.md)
- [Policy packs](./docs/risk/policy-packs.md)
- [Self-hosting](./docs/distribution/self-hosting.md)
- [Release checklist](./docs/release-checklist.md)
- [OSS milestone roadmap](./docs/roadmap/oss-milestones.md)
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
- `agent_risk_events` - run/trace risk findings with severity, owner, evidence, provenance, and remediation.
- `evidence_packets` - packet status, insurability posture, summary, audit trail, and failure nodes.
- `memories` - optional future memory layer.

## Verification

The complete source-release checks are documented in the
[release checklist](./docs/release-checklist.md). The shortest local suite is:

```bash
python -m unittest discover -s apps/api/tests -v
python -m unittest discover -s packages/shared/tests -v
```

```bash
cd apps/web
npx tsc --noEmit --pretty false
npx eslint
npm run build
```

```bash
cd packages/ollive-js
npm ci
npm run typecheck
npm run typecheck:examples
npm run test:package
```

```bash
git diff --check
docker compose config --quiet
```

## Shipping Position

The accurate v0.1 description is:

> Ollive is an experimental open-source reference implementation that turns
> Ollive-formatted AgentRuns into risk evidence packets.

`The open-source risk layer for AI-agent observability` remains the product
thesis, not a maturity claim. Utility has not been externally validated, the
policy corpus is not calibrated, adapters are unimplemented, and the local
stack lacks production tenancy, retention, deployment hardening, and formal
review controls. See [ship readiness](./docs/ship-readiness.md),
[security](./SECURITY.md), and [license](./LICENSE).
