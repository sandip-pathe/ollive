# JSON AgentRun Ingest

Milestone 2 adds a source-agnostic JSON collector API for `AgentRun`.

The endpoint is intentionally plain HTTP so any backend, script, framework, or
observability adapter can send runs without using the built-in chat UI.

## Auth

Local development works without a collector token.

For shared or production-like environments, set:

```bash
OLLIVE_INGEST_TOKEN=replace-with-a-long-random-token
```

Then send either:

```text
X-Ollive-Token: replace-with-a-long-random-token
```

or:

```text
Authorization: Bearer replace-with-a-long-random-token
```

## Create A Run

```bash
curl -X POST http://localhost:8001/v1/runs \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "run_claim_demo_001",
    "started_at": "2026-07-03T00:00:00Z",
    "completed_at": "2026-07-03T00:00:03Z",
    "agent": {
      "name": "claims-support-agent",
      "version": "2026.07.03",
      "environment": "local"
    },
    "task": {
      "type": "claim_question",
      "input": "Will my roof claim be approved?"
    },
    "authority": {
      "scope": "informational_support",
      "allowed_actions": ["explain_process"],
      "disallowed_actions": ["approve_claim", "deny_claim", "guarantee_payout"],
      "requires_handoff": ["coverage_decision"]
    },
    "steps": [
      {
        "step_id": "step_model_1",
        "type": "model_call",
        "status": "success",
        "input": {"provider": "openai", "model": "gpt-4o-mini"},
        "output": {"text": "I cannot approve the claim, but I can explain the review process."}
      }
    ],
    "outcome": {
      "status": "success",
      "summary": "Answered with informational guidance only.",
      "side_effects": []
    },
    "evidence": {
      "redaction_applied": true,
      "source": "json"
    }
  }'
```

The response includes the normalized run and the generated evidence packet.

## Append Events

```bash
curl -X POST http://localhost:8001/v1/runs/run_claim_demo_001/events \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      {
        "step_id": "step_handoff_1",
        "type": "human_handoff",
        "status": "success",
        "output": {
          "reviewer_role": "claims_specialist",
          "decision": "needs_manual_review"
        }
      }
    ]
  }'
```

Appending events recomputes the packet.

## Read Packet

```bash
curl http://localhost:8001/v1/runs/run_claim_demo_001/evidence-packet
```

## Incomplete Evidence Is Expected

Ollive accepts incomplete runs because real production instrumentation often
arrives in stages. Incomplete evidence should not become a false safe signal.

Examples of missing evidence that should affect posture:

- no authority scope
- no agent steps
- no model call or external action
- side effect without handoff
- coverage or regulated advice without source/tool evidence

## Current Limits

- The collector stores `AgentRun` and run steps in Postgres.
- The run-level evidence packet uses the deterministic `agentic_insurance_v1`
  policy pack.
- Optional AI analysis is a later milestone.
- LangSmith and OpenTelemetry adapters are later milestones.
