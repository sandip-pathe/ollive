# Tradeoffs

## Trace-First Insurance Evidence

Ollive treats the trace as the source of truth. This makes evidence packets inspectable and repeatable, but it means weak traces produce weak packets. If an agent does not emit retrieval, tool, escalation, or terminal events, the packet should say the evidence is incomplete instead of pretending the run is safe.

## Deterministic Rules Before LLM Judgment

The current classifier is deterministic and pattern-based. That keeps packet generation explainable and cheap, but it will miss subtle intent and domain-specific policy language. A production version should add eval-backed LLM classification, human review queues, and versioned policy packs.

## Raw Payloads vs Privacy

Raw request/response inspection is useful for proof of work and debugging. It is risky for production because prompts can contain sensitive business or customer data. Production needs retention limits, tenant isolation, role-based access, and field-level redaction controls.

## In-Process Packet Generation vs Durable Queue

Generating packets from the API keeps the MVP simple and responsive. It is not durable enough for production. A worker-backed queue should own retries, idempotency, backpressure, and recompute jobs.

## Auth Bypass vs Developer Speed

Local auth bypass makes the demo easy to run and test. It must stay scoped to local development. Shared and production environments should require invite/session auth and a real session secret.

## Chat-As-Agent First

Starting with chat keeps the product understandable. The same trace and evidence model can extend to workflow agents, tool-using agents, and background automations. The missing piece is an external SDK contract that third-party agents can use without going through the built-in chat UI.
