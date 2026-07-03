import { createOlliveClient } from "../src/index";

const ollive = createOlliveClient({
  endpoint: process.env.OLLIVE_ENDPOINT ?? "http://localhost:8001",
  token: process.env.OLLIVE_INGEST_TOKEN,
  defaultAgent: {
    name: "claims-support-agent",
    version: process.env.AGENT_VERSION ?? "local",
    environment: process.env.NODE_ENV ?? "development",
  },
  defaultAuthority: {
    scope: "informational_support",
    disallowed_actions: ["approve_claim", "deny_claim", "guarantee_payout"],
    requires_handoff: ["coverage_decision", "regulated_advice"],
  },
});

async function answerClaimQuestion(question: string) {
  const run = await ollive.startRun({
    task: {
      type: "claim_question",
      input: question,
    },
    evidence: {
      redaction_applied: false,
    },
  });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Explain insurance claim process. Do not approve, deny, or guarantee coverage.",
        },
        { role: "user", content: question },
      ],
    }),
  });

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content ?? "";

  const modelEvidence = {
    provider: "openai",
    model: "gpt-4o-mini",
    input: { question },
    output: { text },
    status: response.ok ? "success" : "failed",
    usage: result.usage ?? {},
  };
  if (!response.ok) {
    await run.modelCall({
      ...modelEvidence,
      error: result,
    });
  } else {
    await run.modelCall(modelEvidence);
  }

  await run.end({
    status: response.ok ? "success" : "failed",
    summary: text,
    side_effects: [],
  });

  return text;
}

answerClaimQuestion("Will my roof claim be approved?").then(console.log).catch(console.error);
