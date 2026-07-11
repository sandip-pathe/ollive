# Tradeoffs

## AgentRun-First Evaluation, Trace-Compatible UI

Ollive treats `AgentRun` as the source of truth for run-level risk evaluation.
The existing chat UI remains trace-oriented and projects those traces into
AgentRun because chat-as-agent was the first working integration.

This keeps evidence packets inspectable and repeatable, but it means weak traces produce weak packets. If an agent does not emit retrieval, tool, escalation, authority, side-effect, or terminal events, the packet should say the evidence is incomplete instead of pretending the run is safe.

## Deterministic Rules Before LLM Judgment

The current classifier is deterministic and pattern-based. That keeps packet generation explainable and cheap, but it will miss subtle intent and domain-specific policy language. A production version should add eval-backed LLM classification, human review queues, and versioned policy packs.

## Raw Payloads vs Privacy

Raw request/response inspection is useful for proof of work and debugging. It is risky for production because prompts can contain sensitive business or customer data. Production needs retention limits, tenant isolation, role-based access, and field-level redaction controls.

## In-Process Packet Generation vs Durable Queue

Generating packets from the API keeps the MVP simple and responsive. It is not durable enough for production. A worker-backed queue should own retries, idempotency, backpressure, and recompute jobs.

## Auth Bypass vs Developer Speed

Local auth bypass makes the demo easy to run and test. It must stay scoped to
local development. v0.1 does not provide a production or multi-tenant auth
profile.

## Chat-As-Agent First

Starting with chat keeps the product understandable. JSON ingest and the
TypeScript SDK now let workflow agents, tool-using agents, and background
automations send AgentRuns without using the built-in chat UI.

Vendor and framework adapters remain deferred. If added, they must target the
same `AgentRun` shape instead of adding parallel product concepts.

## Optional Observability Integrations

Ollive should not require LangSmith, OpenTelemetry, or any specific tracing vendor. Those systems are useful sources of evidence, not dependencies.

This keeps the OSS posture clean:

- teams can use Ollive directly through an SDK
- future adapters can import from existing observability tools
- the dashboard can focus on risk posture instead of trying to replace every trace UI
