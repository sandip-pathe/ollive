import { createOlliveClient } from "../src/index";

const ollive = createOlliveClient({
  endpoint: process.env.OLLIVE_ENDPOINT ?? "http://localhost:8001",
  token: process.env.OLLIVE_INGEST_TOKEN,
  defaultAgent: "claims-triage-workflow",
  defaultAuthority: {
    scope: "triage_only",
    allowed_actions: ["lookup_policy", "summarize_claim", "route_to_specialist"],
    disallowed_actions: ["approve_claim", "deny_claim", "issue_payment"],
    requires_handoff: ["coverage_decision", "payment_change"],
  },
});

async function runClaimsTriage(claimId: string) {
  const run = await ollive.startRun({
    task: {
      type: "claim_triage",
      input: { claim_id: claimId },
    },
    metadata: {
      workflow_owner: "claims-ops",
    },
  });

  await run.toolCall({
    name: "policy_lookup",
    input: { claim_id: claimId },
    output: {
      policy_found: true,
      policy_status: "active",
    },
  });

  await run.modelCall({
    provider: "openai-compatible",
    model: "triage-model",
    input: { claim_id: claimId },
    output: {
      recommendation: "route_to_specialist",
      reason: "Coverage decision requires licensed review.",
    },
  });

  await run.handoff({
    reviewerRole: "claims_specialist",
    decision: "manual_review_required",
    reason: "Coverage decision requested by customer.",
  });

  await run.end({
    status: "success",
    summary: "Claim routed to a specialist with no automated coverage decision.",
    side_effects: [{ type: "queue_update", value: "claims_specialist_review" }],
  });
}

runClaimsTriage("claim_123").catch(console.error);
