# JavaScript SDK Integration

Ollive v0.1 includes `packages/ollive-js`, the first-party TypeScript SDK for
sending runtime evidence into Ollive.

The SDK is intentionally thin. It normalizes agent activity into `AgentRun`
payloads and sends them to your Ollive collector. It does not require
LangSmith, Vercel, OpenTelemetry, or any hosted Ollive service.

## Install

From a local checkout:

```bash
npm install ./packages/ollive-js
```

The package is not published to npm in v0.1. CI packs and installs the tarball
on Node 18 and 22 so a future publish is reproducible.

## One-Line Client

```ts
import { createOlliveClient } from "@ollive/risk-layer";

const ollive = createOlliveClient({
  endpoint: process.env.OLLIVE_ENDPOINT ?? "http://localhost:8001",
  token: process.env.OLLIVE_INGEST_TOKEN,
});
```

## Instrument An Agent Run

```ts
const run = await ollive.startRun({
  agent: {
    name: "claims-support-agent",
    environment: "local",
  },
  task: {
    type: "claim_question",
    input: "Will this claim be approved?",
  },
  authority: {
    scope: "informational_support",
    disallowed_actions: ["approve_claim", "deny_claim", "guarantee_payout"],
    requires_handoff: ["coverage_decision"],
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

## Record Risk-Relevant Evidence

Use model calls for reasoning evidence:

```ts
await run.modelCall({
  provider: "openai",
  model: "gpt-4o-mini",
  input: { prompt },
  output: { text },
  usage: { total_tokens: 712 },
});
```

Use tool calls for source and action evidence:

```ts
await run.toolCall({
  name: "policy_lookup",
  input: { claim_id: "claim_123" },
  output: { policy_found: true },
});
```

Use handoff for review evidence:

```ts
await run.handoff({
  reviewerRole: "claims_specialist",
  decision: "manual_review_required",
  reason: "Coverage decision requested by customer.",
});
```

Use external actions for side effects:

```ts
await run.externalAction({
  name: "ticket_update",
  input: { ticket_id: "ticket_123" },
  output: { status: "needs_claims_review" },
});
```

## Non-Blocking Delivery

Agent code should not fail because observability delivery failed.

```ts
ollive.fireAndForget(
  ollive.recordToolCall("run_123", {
    name: "policy_lookup",
    output: { policy_found: true },
  })
);
```

Set `onDeliveryError` on the client if you want local logging for failed
delivery.

## What Ollive Infers

The SDK gives Ollive enough evidence to generate risk findings around:

- missing authority scope
- model outputs that make coverage or regulated promises
- side effects without human review
- missing tool/source evidence
- missing handoff evidence
- runtime errors and failed steps
- unsupported or overconfident claims

The developer does not need to model these risk categories by hand. The SDK only
captures what happened; Ollive's experimental classifier interprets it.

## Boundaries

- Node 18 or newer is supported by the package contract.
- A repeated non-null `step_id` is idempotent at the v0.1 collector.
- The optional ingest token is shared collector access, not tenant authorization.
- The collector persists source evidence; minimize and redact sensitive values.
- Packet posture is heuristic review support, not a safety, compliance,
  underwriting, or insurance decision.
