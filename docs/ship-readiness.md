# Ship Readiness

This document tracks the current push-ready state for the agentic insurance observability work and the Milestone 1 OSS risk-layer reframe.

## Current Status

Ollive can be described as an agentic insurance observability MVP for chat-as-agent workflows.

It has:

- live chat traces
- trace events and raw payload inspection
- metrics overview
- Markdown chat rendering
- local auth bypass for development
- Docker Compose web/API/database/Redis/worker stack
- policy rules for agentic insurance risk
- persisted risk events
- persisted evidence packets
- recompute endpoint and UI action
- evidence packet UI with posture, risk events, audit trail, and failure nodes

Milestone 1 adds the product and architecture contract for the next version:

- Ollive's target claim is "the open-source risk layer for AI-agent observability."
- `AgentRun` is the canonical future product object.
- current chat traces are documented as the first AgentRun evidence source.
- LangSmith, OpenTelemetry, custom logs, JSON ingest, and native SDKs are positioned as optional inputs.
- no new collector endpoint, SDK, or database migration has shipped yet.

## Claim Boundary

Safe claim:

> Ollive is an agentic insurance observability tool that turns AI chat-agent traces into risk and insurability evidence packets.

Strategic direction:

> Ollive is the open-source risk layer for AI-agent observability.

Do not claim yet:

> Ollive is a production LangSmith replacement.

Also do not claim yet:

> Ollive has production-ready external agent SDK ingestion.

> Ollive persists AgentRun as a first-class database table.

The current system is suitable for demo, design partner feedback, and proof-of-work. Production needs the blockers below resolved.

## Production Blockers

- External SDK ingestion for arbitrary agent workflows.
- Collector API for normalized `AgentRun` ingest.
- Database persistence for first-class agent runs and run steps.
- Durable queue for evidence packet generation and recompute jobs.
- Multi-tenant auth, access control, and audit logs.
- Retention and redaction policy for raw payloads.
- Alerts, thresholds, and review queues.
- Classifier evals and human review workflow.
- CI coverage for API and frontend.
- Deployment hardening with bypass disabled.

## Known Local Repo State

- The local branch is `main`.
- The branch is aligned with `origin/main` before the Milestone 1 doc changes.
- `linkedin-content/` is untracked and unrelated to this ship set.
- The Milestone 1 change set should be documentation-only.

Before pushing from this machine, confirm no unrelated files are staged.

## Verification Commands

API syntax:

```bash
python -m py_compile apps/api/app/auth.py apps/api/app/db.py apps/api/app/routes.py apps/api/app/trace_runtime.py apps/api/app/risk_classifier.py
```

Web types:

```bash
cd apps/web
npx tsc --noEmit --pretty false
```

Web lint:

```bash
cd apps/web
npx eslint
```

Repo whitespace:

```bash
git diff --check
```

Runtime smoke:

```bash
docker compose ps
```

```bash
Invoke-WebRequest http://localhost:3000
```

```bash
Invoke-WebRequest http://localhost:8001/health
```

## Suggested Commit Scope

For Milestone 1, include documentation only:

- `README.md`
- `docs/ARCHITECTURE_LOCK.md`
- `docs/agentic-insurance-observability.md`
- `docs/architecture.md`
- `docs/architecture/agent-risk-layer.md`
- `docs/architecture/agent-run-schema.md`
- `docs/product/oss-risk-layer.md`
- `docs/roadmap/oss-milestones.md`
- `docs/schema.md`
- `docs/ship-readiness.md`
- `docs/tradeoffs.md`

Exclude:

- `linkedin-content/`
