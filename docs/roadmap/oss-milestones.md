# Ollive v0.1 Implementation Record

This document records the six implementation milestones that produced the v0.1
experimental AgentRun risk-evidence reference. It is historical execution
context, not a promise of future maintenance or production readiness.

The implementation strategy is a strangler refactor. Keep the current app
working, introduce the new `AgentRun` core, and migrate features onto it without
throwing away the working trace, risk, packet, and dashboard code.

## Milestone 1: Product Reframe And Canonical Schema

Status: complete in commit `dec34fe`.

Goal: make `AgentRun` the canonical product object and make chat the first
example integration, not the product boundary.

Deliverables:

- product thesis for the OSS risk layer
- target architecture document
- canonical `AgentRun` schema
- mapping from current chat traces to `AgentRun`
- updated README and current architecture docs
- explicit claim boundary and non-goals

Sanity checks:

- every current trace field has a mapping or documented gap
- current chat flow remains a valid first integration
- external agents are not forced into chat-specific vocabulary
- missing evidence is treated as risk signal, not silence
- docs do not claim SDK or collector work that has not shipped yet

Verification:

```bash
git diff --check
```

Manual review:

- read README from top to bottom
- confirm "Ollive is the open-source risk layer" is future direction
- confirm "chat-as-agent MVP" is still the safe current claim

## Milestone 2: Collector API And JSON Ingest

Status: complete in commit `2e510b9`.

Goal: let any backend send agent runs to Ollive without using the chat UI.

Deliverables:

- `/v1/runs` create/read endpoint
- `/v1/runs/{run_id}/events` append endpoint
- `/v1/runs/{run_id}/evidence-packet` endpoint
- JSON schema validation for `AgentRun`
- run-to-trace compatibility path for current UI
- clear error responses for malformed or incomplete payloads

Sanity checks:

- `curl` can create a run and packet
- incomplete runs generate missing-evidence warnings
- chat traces can be projected into the same run shape
- bad input returns problem, cause, and fix
- no Ollive cloud service is required

Verification:

```bash
python -m py_compile apps/api/app/auth.py apps/api/app/db.py apps/api/app/routes.py apps/api/app/trace_runtime.py apps/api/app/risk_classifier.py
```

```bash
Invoke-WebRequest http://localhost:8001/health
```

Manual review:

- create one complete run by JSON
- create one incomplete run by JSON
- confirm packets differ honestly

## Milestone 3: JavaScript SDK

Status: complete in commit `a4afa32` as a repository-local package.

Goal: make first integration direct enough that a developer can generate a
packet from the repository without a hosted service.

Deliverables:

- JS package for Ollive ingest
- `startRun`, `recordModelCall`, `recordToolCall`, `recordHandoff`, `endRun`
- async, non-blocking delivery
- retry or queue policy that does not break host apps
- examples for plain OpenAI and a custom workflow agent
- getting started docs

Sanity checks:

- SDK failure does not crash the host app
- no AI API key is required for deterministic risk packets
- one example app produces a packet locally
- TypeScript types match the documented AgentRun schema
- README provides one canonical packet-first path

Verification:

```bash
cd apps/web
npx tsc --noEmit --pretty false
```

```bash
cd apps/web
npx eslint
```

Manual review:

- install SDK from local package
- instrument sample agent
- generate packet from one happy path and one risky path

## Milestone 4: Risk Engine V2 And Optional AI Analysis

Status: complete in commit `050d69d` as `risk-classifier-v2`.

Goal: move from trace-specific rule code to a run-level risk engine with optional
BYOK AI analysis.

Deliverables:

- risk engine module that consumes `AgentRun`
- deterministic `agentic_insurance_v1` policy pack preserved
- optional AI analyzer behind user-provided key
- risk finding provenance: deterministic, AI, or human review
- eval fixtures for safe, risky, blocked, and incomplete runs
- regression tests for packet posture

Sanity checks:

- deterministic mode works offline
- AI mode is optional and clearly labeled
- every finding includes evidence, confidence, owner, and remediation
- unsupported AI output cannot silently overwrite deterministic findings
- eval failures block release

Verification:

```bash
python -m py_compile apps/api/app/risk_classifier.py
```

```bash
python -m unittest discover -s apps/api/tests
```

Manual review:

- compare deterministic and AI-assisted packet output
- confirm findings point back to source evidence
- confirm missing evidence stays visible

## Milestone 5: Dashboard Reframe Around Risk Posture

Status: complete in commit `15f7370` in the Inspect dashboard.

Goal: make the UI feel like risk observability for agents, not generic trace
inspection.

Deliverables:

- run-first dashboard
- risk posture summary
- missing-evidence view
- stakeholder tabs or filters
- trace detail as drilldown
- evidence packet export as JSON first
- empty states that explain how to instrument an agent

Sanity checks:

- founder/CTO can understand whether agents are safe to ship
- engineer can find the failing node
- risk reviewer can see evidence, owner, and remediation
- empty workspace points to SDK/JSON ingest, not only chat
- chat remains usable as example data

Verification:

```bash
cd apps/web
npx tsc --noEmit --pretty false
```

```bash
cd apps/web
npx eslint
```

Manual review:

- desktop and mobile UI smoke test
- no overlap or unreadable text in dashboard states
- compare a complete run, incomplete run, and blocked run

## Milestone 6: OSS Distribution And Adapter Layer

Status: complete in commit `7833024`, with release-integrity closeout in v0.1.0.

Goal: make Ollive useful without Sandip, without a hosted Ollive service, and
without requiring any one observability vendor.

Deliverables:

- local/reference Docker path documented and tested
- JS SDK package release path
- explicit documentation that Python, LangSmith, and OpenTelemetry adapters do
  not ship in v0.1
- policy-pack authoring guide
- contribution guide
- release checklist

Sanity checks:

- fresh machine setup works from README
- no hidden dependency on Ollive cloud
- external sample repo generates packets
- JSON and TypeScript SDK input normalize to the same AgentRun model
- claim boundary remains accurate

Verification:

```bash
docker compose up -d --build
docker compose ps
```

```bash
Invoke-WebRequest http://localhost:3000
Invoke-WebRequest http://localhost:8001/health
```

Manual review:

- follow README as a new user
- generate one packet through SDK path
- generate one packet through the JSON path
- export evidence packet

## Release Gate After Every Milestone

Before pushing a milestone:

```bash
git status --short --branch
git diff --check
```

Run code checks only when code changed:

```bash
python -m py_compile apps/api/app/auth.py apps/api/app/db.py apps/api/app/routes.py apps/api/app/trace_runtime.py apps/api/app/risk_classifier.py
```

```bash
cd apps/web
npx tsc --noEmit --pretty false
npx eslint
```

For runtime-impacting milestones:

```bash
docker compose up -d --build
docker compose ps
Invoke-WebRequest http://localhost:3000
Invoke-WebRequest http://localhost:8001/health
```

The milestone is not done until the docs, claim boundary, verification commands,
and user-facing first-run path agree with each other.
