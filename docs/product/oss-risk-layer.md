# Ollive OSS Risk Layer

Ollive is becoming the open-source risk layer for AI-agent observability.

The core idea is simple: existing observability tools can show traces, latency,
tokens, prompts, tool calls, and errors. Ollive sits on top of those signals and
turns them into risk evidence: what the agent did, where it crossed authority
boundaries, which failures matter, and who owns remediation.

## Product Position

Ollive is:

- self-hosted by default
- open-source by design
- independent of hosted Ollive infrastructure
- compatible with existing observability systems
- focused on risk, auditability, accountability, and insurability

Ollive is not:

- a hosted tracing vendor
- a replacement for every LangSmith, OpenTelemetry, or logging workflow
- a guarantee that an agent is safe
- an insurance underwriter
- a compliance certification system

The sharp claim is:

> Ollive is the open-source risk layer for AI-agent observability.

The safe current claim is:

> Ollive is an agentic insurance observability MVP that turns chat-as-agent traces
> into risk and insurability evidence packets.

## Why This Should Exist

Critical-industry teams do not only need to know whether an agent was fast or
cheap. They need to know whether the agent can be trusted inside a real workflow.

The questions are different by stakeholder:

- Engineers ask: what failed, where, and can I reproduce it?
- Founders and CTOs ask: are agents reliable enough to ship to customers?
- Risk reviewers ask: what evidence proves this agent stayed inside its authority?
- Compliance teams ask: who reviewed the risky run and what changed afterward?
- Insurers ask: what failure modes are systemic versus isolated?

Ollive should own this layer.

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

Ollive should accept evidence from many sources:

- native Ollive SDKs
- JSON ingest
- OpenTelemetry spans
- LangSmith exports or callbacks
- custom backend logs
- current built-in chat traces

LangSmith and similar tools are inputs, not dependencies. Ollive should be useful
with them, without them, and after a team replaces them.

## Deployment Posture

Ollive should require no hosted Ollive runtime.

The default developer path should be:

```text
install SDK
start local Ollive
send one agent run
open evidence packet
```

The default production path should be:

```text
self-host collector + database + dashboard
configure retention and auth
send agent runs from application code
export evidence packets for review
```

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

Milestone 1 is successful when the repo clearly says:

- `AgentRun` is the canonical future product object.
- chat remains the first example integration.
- evidence packets are generated from normalized agent evidence.
- Ollive is independent of LangSmith and other observability vendors.
- the next milestone can implement ingest against a stable schema.
