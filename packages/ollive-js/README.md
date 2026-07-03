# @ollive/risk-layer

TypeScript client for sending AI-agent runtime evidence into Ollive.

Ollive is the open-source risk layer for AI-agent observability. This package
does not require Ollive-hosted infrastructure. It sends normalized `AgentRun`
payloads to your self-hosted Ollive collector at `/v1/runs`.

## Install

From this repo:

```bash
npm install ./packages/ollive-js
```

After npm publishing:

```bash
npm install @ollive/risk-layer
```

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

await run.end({
  status: "success",
  summary: "Answered with process guidance only.",
  side_effects: [],
});
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
