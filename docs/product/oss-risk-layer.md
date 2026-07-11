# Ollive Risk-Layer Product Thesis

Ollive explores whether an open-source risk layer should exist above AI-agent
observability evidence. v0.1 is an experimental reference implementation, not
proof that Ollive owns that category.

The core idea is simple: existing observability tools can show traces, latency,
tokens, prompts, tool calls, and errors. Ollive sits on top of those signals and
turns them into risk evidence: what the agent did, where it crossed authority
boundaries, which failures matter, and who owns remediation.

## Product Position

Ollive is:

- self-contained and locally runnable
- open-source by design
- independent of hosted Ollive infrastructure
- designed around vendor-independent AgentRun evidence
- focused on risk, auditability, accountability, and authority boundaries

Ollive is not:

- a hosted tracing vendor
- a replacement for every LangSmith, OpenTelemetry, or logging workflow
- a guarantee that an agent is safe
- an insurance underwriter
- a compliance certification system

The long-term thesis is:

> Ollive is the open-source risk layer for AI-agent observability.

The accurate v0.1 claim is:

> Ollive is an experimental open-source reference implementation that turns
> Ollive-formatted AgentRuns into risk evidence packets.

## Why This Should Exist

Critical-industry teams do not only need to know whether an agent was fast or
cheap. They need to know whether the agent can be trusted inside a real workflow.

The questions are different by stakeholder:

- Engineers ask: what failed, where, and can I reproduce it?
- Founders and CTOs ask: are agents reliable enough to ship to customers?
- Risk reviewers ask: what evidence proves this agent stayed inside its authority?
- Compliance teams ask: who reviewed the risky run and what changed afterward?
- Insurers ask: what failure modes are systemic versus isolated?

Ollive tests whether this layer is useful enough to deserve a standalone project.

## Product Unit

The canonical product unit is an `AgentRun`.

A run represents one agent attempt to complete a task. A run can contain model
calls, tool calls, retrieval, memory access, human handoff, external side effects,
errors, and final outcome.

Current chat traces are the first source of `AgentRun` evidence. They are not the
long-term product boundary.

```text
chat trace
  -> normalized AgentRun
  -> risk findings
  -> evidence packet
  -> review, export, remediation
```

## Integration Posture

Ollive v0.1 accepts evidence from:

- the first-party TypeScript SDK
- JSON ingest
- current built-in chat traces

OpenTelemetry, LangSmith, Python, and custom-log adapters are possible future
inputs, not shipped compatibility. Ollive does not depend on those systems.

## Deployment Posture

Ollive requires no hosted Ollive runtime.

The default developer path should be:

```text
install SDK
start local Ollive
send one agent run
open evidence packet
```

The included Compose stack is local/reference only. A production path would
require tenant authorization, retention enforcement, durable operations,
versioned migrations, security hardening, and independent validation; v0.1 does
not provide that path.

## First Market Wedge

The first wedge is not generic analytics. It is risk observability for agents in
high-accountability workflows.

Good first users:

- AI-agent startups selling into regulated or high-trust industries
- teams deploying agents into support, claims, finance, healthcare, legal, or ops
- founders who need to prove agent reliability to customers or investors
- engineering teams whose existing tracing stack does not answer risk questions

Bad first users:

- teams only optimizing token cost
- hobby chatbot demos with no authority or external consequences
- users looking for a hosted monitoring SaaS

## Success Criteria

The v0.1 thesis artifact is successful when the repo clearly says:

- `AgentRun` is the canonical product object.
- chat remains the first example integration.
- evidence packets are generated from normalized agent evidence.
- Ollive is independent of LangSmith and other observability vendors.
- adapters are unimplemented, findings are unvalidated, and packet output is
  experimental review support only.
