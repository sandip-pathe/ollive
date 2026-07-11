# @ollive/risk-layer

TypeScript client for sending AI-agent runtime evidence into Ollive.

This package instruments Ollive's experimental AgentRun risk-evidence reference
implementation. It requires no Ollive-hosted infrastructure and sends normalized
`AgentRun` payloads to your collector at `/v1/runs`.

## Install

From this repo:

```bash
npm install ./packages/ollive-js
```

`@ollive/risk-layer` is not published to npm as part of v0.1. The package name
and metadata reserve a reproducible future publish path.

## Minimal Use

```ts
import { createOlliveClient } from "@ollive/risk-layer";

const ollive = createOlliveClient({
  endpoint: process.env.OLLIVE_ENDPOINT ?? "http://localhost:8001",
  token: process.env.OLLIVE_INGEST_TOKEN,
  defaultAgent: {
    name: "claims-support-agent",
    environment: "production",
  },
  defaultAuthority: {
    scope: "informational_support",
    disallowed_actions: ["approve_claim", "deny_claim", "guarantee_payout"],
    requires_handoff: ["coverage_decision"],
  },
});

const run = await ollive.startRun({
  task: {
    type: "claim_question",
    input: "Will this claim be approved?",
  },
});

await run.modelCall({
  provider: "openai",
  model: "gpt-4o-mini",
  input: { prompt: "Will this claim be approved?" },
  output: { text: "I can explain the review process, but cannot approve it." },
});

const result = await run.end({
  status: "success",
  summary: "Answered with process guidance only.",
  side_effects: [],
});

console.log(result.evidence_packet);
```

## Fire-And-Forget Delivery

Use this when observability should never block the agent path:

```ts
ollive.fireAndForget(
  ollive.recordToolCall("run_123", {
    name: "policy_lookup",
    input: { claim_id: "claim_123" },
    output: { found: true },
  })
);
```

Configure `onDeliveryError` if you want to log failed delivery locally.

## Core Concepts

- `startRun` creates a normalized agent run with task, authority, and evidence.
- `modelCall` records model input/output evidence.
- `toolCall` records tool usage and tool result evidence.
- `handoff` records human review evidence.
- `externalAction` records side effects such as ticket changes, refunds, claim
  mutations, or emails.
- `end` completes the run and refreshes the evidence packet.

Ollive treats missing authority, missing steps, missing tool results, missing
handoff, runtime failures, and unsafe side effects as risk evidence instead of
silently treating unknowns as safe.

## Boundaries

- Node 18 or newer is required.
- Delivery is to one self-hosted collector and optional shared ingest token;
  this is not tenant-scoped authorization.
- Inputs and outputs can contain sensitive data. Minimize or redact evidence
  before delivery.
- Packet posture is experimental heuristic review support, not a safety,
  compliance, underwriting, or insurance decision.
