# Agentic Insurance Observability

Ollive is aimed at the insurance side of AI-agent adoption. The customer is not only asking "did the model respond fast?" They are asking "can we insure this agent action, and what evidence proves it?"

## Product Wedge

Insurance for agentic AI needs a record of what the agent did, what it knew, where it crossed a boundary, and who is accountable for remediation. Chat is the first agent surface. The same model should later apply to workflow agents, tool-using agents, and background automations.

## Stakeholders

Engineers care about:

- trace completeness
- event coverage
- runtime failures
- latency and first-token time
- request and response payload evidence
- replayability and recompute behavior

Founders and CTOs care about:

- reliability posture
- customer-impacting risk
- whether the agent can be trusted in live workflows
- how much of the risk is systemic versus one-off
- whether the product can prove improvement over time

Insurance and risk reviewers care about:

- authority boundaries
- regulated or coverage-adjacent advice
- unsupported claims
- escalation and human review evidence
- PII exposure
- failure nodes
- owner and remediation trail
- auditability of the classifier and policy pack

## Evidence Packet

The Agent Risk & Insurability Evidence Packet is the core product object.

It contains:

- packet status
- insurability posture
- summary
- risk events
- severity and confidence
- owner
- evidence quote
- evidence source
- remediation
- audit trail
- failure nodes

The packet is generated from trace evidence. It should not claim safety when the trace is incomplete.

## Current Policy Pack

`agentic_insurance_v1` currently detects:

- risky promise or guarantee
- coverage or regulated advice
- PII exposure
- missed escalation
- unsupported claim
- unsafe action suggestion
- runtime failure node
- authority boundary breach

Each finding maps to a stakeholder owner such as Engineering, Support, Founder, or Legal/Compliance.

## Why This Is Observability

Generic LLM observability often stops at requests, latency, tokens, cost, errors, and traces. Ollive adds domain-specific interpretation on top of those traces.

The important shift is:

```text
raw telemetry -> trace evidence -> risk event -> insurability posture -> accountable remediation
```

That gives technical teams something to debug and business/risk teams something to evaluate.

## What Is Still Needed

To become production-grade, Ollive needs:

- external SDK ingestion for non-chat agents
- durable worker-backed packet generation
- review queues and resolution workflows
- alerting and thresholds
- eval suites for classifier quality
- policy pack versioning UI
- tenant isolation and role-based access
- retention policy and export controls
- better test coverage around streaming and recompute

The current system is a credible MVP and design-partner demo. It is not yet a production insurance control plane.
