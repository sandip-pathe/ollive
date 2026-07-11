# Agentic Insurance Observability

Ollive explores the insurance and risk-review side of AI-agent adoption. The
question is not only "did the model respond fast?" but "what evidence describes
the action, its authority, its failure modes, and its accountability?" v0.1 does
not determine whether an agent or action is insurable.

## Product Wedge

Insurance for agentic AI needs a record of what the agent did, what it knew, where it crossed a boundary, and who is accountable for remediation. Chat is the first agent surface. The same model should later apply to workflow agents, tool-using agents, and background automations.

That shared model is `AgentRun`. JSON, the TypeScript SDK, and projected chat
traces all feed it; chat is not the final product boundary.

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

The experimental Agent Risk Evidence Packet is the core output.

It contains:

- packet status
- heuristic posture
- summary
- risk events
- severity and confidence
- owner
- evidence quote
- evidence source
- remediation
- audit trail
- failure nodes

The packet is generated from normalized `AgentRun` evidence, including projected
chat traces. It separates policy findings from evidence-quality gaps and lists
unevaluated domains. It must not claim safety, compliance, or insurance validity
when evidence is incomplete.

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
raw telemetry -> AgentRun evidence -> risk finding -> heuristic posture -> accountable remediation
```

That gives technical teams something to debug and business/risk teams something to evaluate.

The AgentRun architecture is:

```text
agent run evidence -> risk finding -> evidence packet -> accountable remediation
```

## Production Gaps

To become production-grade, Ollive needs:

- durable worker-backed packet generation
- review queues and resolution workflows
- alerting and thresholds
- externally validated and substantially larger eval suites for classifier quality
- policy pack versioning UI
- tenant isolation and role-based access
- retention policy and export controls
- signed evidence, migration support, deployment hardening, and security review

The current system is an experimental reference implementation. It is not a
production insurance control plane, underwriting model, compliance control, or
safety system.
