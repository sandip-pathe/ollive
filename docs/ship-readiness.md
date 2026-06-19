# Ship Readiness

This document tracks the current push-ready state for the agentic insurance observability work.

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

## Claim Boundary

Safe claim:

> Ollive is an agentic insurance observability tool that turns AI chat-agent traces into risk and insurability evidence packets.

Do not claim yet:

> Ollive is a production LangSmith replacement.

The current system is suitable for demo, design partner feedback, and proof-of-work. Production needs the blockers below resolved.

## Production Blockers

- External SDK ingestion for arbitrary agent workflows.
- Durable queue for evidence packet generation and recompute jobs.
- Multi-tenant auth, access control, and audit logs.
- Retention and redaction policy for raw payloads.
- Alerts, thresholds, and review queues.
- Classifier evals and human review workflow.
- CI coverage for API and frontend.
- Deployment hardening with bypass disabled.

## Known Local Repo State

- The local branch is `main`.
- The branch is behind `origin/main` by 1 commit.
- `linkedin-content/` is untracked and unrelated to this ship set.
- The active change set spans API, web, Docker Compose, schema, and documentation.

Before pushing from this machine, sync the remote commit or move this work to a feature branch.

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

Include:

- `.env.example`
- `apps/api/app/auth.py`
- `apps/api/app/db.py`
- `apps/api/app/routes.py`
- `apps/api/app/trace_runtime.py`
- `apps/api/app/risk_classifier.py`
- `apps/web/app/lib/api.ts`
- `apps/web/app/lib/auth.ts`
- `apps/web/components/auth/auth-gate.tsx`
- `apps/web/components/chat-page.tsx`
- `apps/web/components/chat/assistant-message.tsx`
- `apps/web/components/chat/chat-header.tsx`
- `apps/web/components/chat/chat-layout.tsx`
- `apps/web/components/chat/markdown-message.tsx`
- `apps/web/components/chat/message-list.tsx`
- `apps/web/components/chat/user-message.tsx`
- `apps/web/components/inspect/evidence-packet.tsx`
- `apps/web/components/inspect/inspect-header.tsx`
- `apps/web/components/inspect/inspect-panel.tsx`
- `apps/web/components/inspect/inspect-tabs.tsx`
- `apps/web/components/inspect/ops-review.tsx`
- `apps/web/components/inspect/request-card.tsx`
- `apps/web/components/sidebar/user-profile.tsx`
- `apps/web/tsconfig.json`
- `docker-compose.yml`
- `packages/database/schema.sql`
- documentation files updated for this release

Exclude:

- `linkedin-content/`
