# Agent Risk Layer Architecture

This document describes the target architecture for Ollive as the open-source
risk layer for AI-agent observability.

The current app already captures chat traces and generates evidence packets. The
target architecture keeps that work, but moves the product boundary from chat
traces to normalized `AgentRun` evidence.

## Target Pipeline

```text
customer agent app
  -> Ollive SDK / adapter / JSON ingest
  -> collector API
  -> AgentRun normalizer
  -> run store
  -> risk engine
  -> evidence packet generator
  -> dashboard, review queue, export
```

## Current Pipeline

```text
built-in chat UI
  -> FastAPI chat stream endpoint
  -> OpenAI wrapper or stubbed stream
  -> traces + trace_events + inference_logs
  -> risk classifier
  -> agent_risk_events + evidence_packets
  -> inspect UI
```

Milestone 1 does not replace the current pipeline. It defines how the current
pipeline maps into the future one.

## Component Responsibilities

| Component | Current status | Target responsibility |
| --- | --- | --- |
| Built-in chat | Implemented | First example integration that produces AgentRun evidence. |
| Collector API | JSON `/v1/runs` path implemented | Accept external agent runs and events through stable `/v1` endpoints. |
| Normalizer | JSON and chat-trace projection implemented | Convert SDK, adapter, chat, and JSON input into AgentRun. |
| Run store | `agent_runs`, `agent_run_steps`, and `agent_run_sources` implemented | Persist normalized runs, steps, source evidence, and packet linkage. |
| Risk engine | Implemented as deterministic classifier | Evaluate AgentRun evidence using versioned policy packs. |
| AI analyzer | Implemented as opt-in V2 hook | Optional BYOK reviewer for subtle risk and intent classification. |
| Evidence packets | Implemented for traces | Generate run-level audit packet with findings and missing evidence. |
| Dashboard | Implemented around chat traces | Lead with risk posture, evidence completeness, and stakeholder views. |
| Adapters | Not implemented | Import from LangSmith, OpenTelemetry, and custom logs. |

## Source-Agnostic Ingest

Ollive should not assume one agent framework.

Accepted sources should converge into the same model:

```text
Ollive SDK
LangSmith adapter
OpenTelemetry adapter
custom JSON
built-in chat
  -> AgentRun
```

This keeps the risk layer independent. Teams can keep their existing tracing tool
and still use Ollive for risk posture.

## AgentRun Normalization

Normalization should preserve both source evidence and the canonical run shape.

```text
source event
  -> validation
  -> redaction check
  -> source evidence record
  -> AgentRun / AgentStep projection
  -> risk input
```

Source evidence matters because risk findings must be auditable. A risk reviewer
should be able to inspect the original trace event, model payload, or tool result
that produced a finding.

## Risk Engine Boundary

The risk engine should consume normalized runs, not UI state and not provider-
specific payloads.

```text
AgentRun
  -> policy pack
  -> deterministic rules
  -> optional AI analyzer
  -> RiskFinding[]
  -> EvidencePacket
```

The current `apps/api/app/risk_classifier.py` logic should eventually move behind
this boundary. The first step is to keep its output contract and make its input
look like an `AgentRun`.

## Evidence Packet Contract

Evidence packets are the core output.

An evidence packet should answer:

- What did the agent try to do?
- What evidence was captured?
- What evidence is missing?
- Which policy rules fired?
- Which findings are blocked, risky, or review-only?
- Who owns the issue?
- What remediation is recommended?
- Can this run be defended in an audit?

Packets must avoid false confidence. If evidence is missing, posture should move
toward `unknown` or `needs_review`, not `insurable`.

## Stakeholder Views

The same run should be readable by different stakeholders:

| Stakeholder | Wants to see |
| --- | --- |
| Engineer | failed step, trace event, latency, retry, raw evidence, reproducibility |
| Founder/CTO | reliability posture, blocked runs, systemic risk, trend over time |
| Risk reviewer | authority boundary, handoff evidence, policy finding, remediation owner |
| Compliance/security | PII exposure, retention status, audit trail, exportable packet |

The UI can show these as tabs or filters, but the data model should not fork by
stakeholder.

## LangSmith And Observability Vendors

Ollive should be independent of LangSmith and similar tools.

Correct posture:

- LangSmith can feed Ollive.
- OpenTelemetry can feed Ollive.
- Ollive SDK can feed Ollive directly.
- Ollive should still work if none of those tools are present.

Incorrect posture:

- Ollive requires LangSmith.
- Ollive claims to replace every LangSmith feature.
- Ollive treats trace visualization as the main value.

Ollive's differentiated layer is risk interpretation.

## Milestone 1 Architecture Decision

Keep the existing app and refactor through a strangler path.

```text
current chat traces
  -> document AgentRun mapping
  -> add collector API
  -> add SDK
  -> migrate chat onto AgentRun normalizer
  -> make dashboard run-first
```

This avoids a rewrite and preserves working proof points: trace capture, packet
generation, risk findings, Docker setup, and inspect UI.

## Sanity Checks

Milestone 1 is architecturally sound when:

- every current trace field has a documented AgentRun mapping or a documented gap
- chat remains a valid first integration
- external agents are not forced through chat concepts
- LangSmith is an optional input, not a dependency
- missing evidence is treated as a first-class risk signal
- `/v1/runs` can ingest JSON AgentRun payloads against the schema
