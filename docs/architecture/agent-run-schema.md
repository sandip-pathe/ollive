# AgentRun Schema

`AgentRun` is the canonical observability object for Ollive.

It represents one attempt by an AI agent to complete a task. A chat response is
one kind of agent run. A background workflow, tool-using agent, support agent,
claims agent, coding agent, or approval agent should fit the same shape.

This document is the Milestone 1 contract. It is not fully implemented in the
database yet.

## Design Goals

- Work for chat agents and non-chat workflow agents.
- Preserve enough evidence to make risk findings auditable.
- Make missing evidence visible instead of treating unknowns as safe.
- Support deterministic risk rules first, with optional AI analysis later.
- Stay independent of any single tracing vendor or framework.

## Top-Level Shape

```json
{
  "run_id": "run_01J...",
  "agent": {},
  "task": {},
  "context": {},
  "authority": {},
  "steps": [],
  "outcome": {},
  "evidence": {},
  "metadata": {}
}
```

## Required Fields

| Field | Type | Description |
| --- | --- | --- |
| `run_id` | string | Stable ID for this agent run. |
| `started_at` | ISO timestamp or epoch ms | When the run began. |
| `agent.name` | string | Human-readable agent or workflow name. |
| `task.input` | string or object | The user request, job payload, or workflow trigger. |
| `outcome.status` | enum | `success`, `failed`, `cancelled`, `timeout`, `unknown`. |
| `steps` | array | Ordered evidence events from the run. |

If a source cannot provide all required fields, the collector should still accept
the run when possible, but the evidence packet should mark missing evidence
explicitly.

## Recommended Fields

| Field | Type | Description |
| --- | --- | --- |
| `completed_at` | ISO timestamp or epoch ms | When the run ended. |
| `agent.version` | string | Deployed agent version, prompt version, or workflow version. |
| `agent.environment` | string | `local`, `staging`, `production`, or custom environment. |
| `task.type` | string | Domain-specific run type such as `support_chat`, `claim_review`, `refund_review`. |
| `task.customer_id` | string | Optional external customer or account identifier. |
| `authority.allowed_actions` | array | Actions the agent is allowed to take. |
| `authority.disallowed_actions` | array | Actions the agent must not take. |
| `authority.requires_handoff` | array | Conditions requiring human review. |
| `outcome.summary` | string | Human-readable result. |
| `outcome.side_effects` | array | External actions taken or attempted. |
| `evidence.redaction_applied` | boolean | Whether sensitive data was redacted before storage. |

## Step Model

Each run contains ordered `steps`.

```json
{
  "step_id": "step_01J...",
  "type": "model_call",
  "timestamp": "2026-07-03T00:00:00Z",
  "name": "primary_response",
  "status": "success",
  "input": {},
  "output": {},
  "error": null,
  "evidence_ref": "trace_event:..."
}
```

Supported step types for Milestone 1:

| Step type | Description |
| --- | --- |
| `user_message` | User or external actor input. |
| `model_call` | Model request/response with provider, model, and usage evidence. |
| `tool_call` | Tool invocation, including parameters, result, and error. |
| `retrieval` | Documents, policies, memories, or records used as context. |
| `memory_read` | Long-term memory or profile access. |
| `memory_write` | Memory mutation or saved customer state. |
| `human_handoff` | Escalation, review, approval, or manual intervention. |
| `policy_check` | Guardrail, authorization, or policy decision. |
| `external_action` | Email sent, ticket updated, refund issued, claim changed, API mutation. |
| `runtime_event` | Timeout, retry, cancellation, warning, stream event, or system failure. |

## Risk-Relevant Concepts

### Authority

Authority describes what the agent is allowed to do.

```json
{
  "authority": {
    "scope": "informational_support",
    "allowed_actions": ["answer_policy_questions", "summarize_claim_status"],
    "disallowed_actions": ["approve_claim", "deny_claim", "promise_reimbursement"],
    "requires_handoff": ["coverage_decision", "legal_or_regulated_advice"]
  }
}
```

Ollive should flag a run when the observed steps exceed this authority.

### Human Handoff

Human handoff is evidence that a risky or regulated run was reviewed.

```json
{
  "type": "human_handoff",
  "status": "success",
  "output": {
    "reviewer_role": "claims_specialist",
    "decision": "needs_manual_review"
  }
}
```

Missing handoff should be treated as missing evidence or risk when the authority
model says handoff was required.

### Side Effects

Side effects are external changes caused by the agent.

Examples:

- refund issued
- policy cancelled
- claim status changed
- email sent
- CRM field updated
- support ticket closed

Side effects increase risk because the agent changed the world, not just text.

### Missing Evidence

Unknown is not safe.

If a run lacks tool evidence, retrieval evidence, terminal status, handoff evidence,
or side-effect evidence, the packet should say so.

Examples:

- `missing_terminal_event`
- `missing_tool_result`
- `missing_handoff_evidence`
- `missing_authority_scope`
- `missing_redaction_status`

## Chat Trace Mapping

The current Ollive chat system maps into `AgentRun` like this:

| Current data | AgentRun field |
| --- | --- |
| `traces.trace_id` | `run_id` or source evidence ID |
| `conversations.id` | `session_id` or `task.thread_id` |
| `messages.content` user turn | `task.input` and `steps[type=user_message]` |
| OpenAI wrapper call | `steps[type=model_call]` |
| `trace_events` | `steps[type=runtime_event]` |
| `raw_request_json` | `steps[type=model_call].input` |
| `raw_response_json` / assistant preview | `steps[type=model_call].output` |
| `pii_detected` | `evidence.redaction_applied` and risk input |
| `agent_risk_events` | `risk_findings` generated from the normalized run |
| `evidence_packets` | packet generated for the run |

Current chat does not yet provide:

- explicit `authority` scope
- explicit tool calls
- retrieval evidence
- side-effect evidence
- structured human handoff evidence
- agent version or deployment metadata

That is acceptable for the MVP, but packets must surface these gaps.

## Example Run

```json
{
  "run_id": "run_claim_support_001",
  "started_at": "2026-07-03T00:00:00Z",
  "completed_at": "2026-07-03T00:00:04Z",
  "agent": {
    "name": "claims-support-agent",
    "version": "2026.07.03",
    "environment": "production"
  },
  "task": {
    "type": "claim_question",
    "input": "Will my roof claim be approved?",
    "customer_id": "cust_123"
  },
  "authority": {
    "scope": "informational_support",
    "allowed_actions": ["explain_process", "summarize_policy_language"],
    "disallowed_actions": ["approve_claim", "deny_claim", "guarantee_payout"],
    "requires_handoff": ["coverage_decision"]
  },
  "steps": [
    {
      "step_id": "step_1",
      "type": "user_message",
      "timestamp": "2026-07-03T00:00:00Z",
      "status": "success",
      "input": "Will my roof claim be approved?"
    },
    {
      "step_id": "step_2",
      "type": "model_call",
      "timestamp": "2026-07-03T00:00:01Z",
      "status": "success",
      "input": {
        "provider": "openai",
        "model": "gpt-4o-mini"
      },
      "output": {
        "text": "I cannot approve the claim, but I can explain the review process."
      }
    }
  ],
  "outcome": {
    "status": "success",
    "summary": "Answered with informational guidance only.",
    "side_effects": []
  },
  "evidence": {
    "redaction_applied": true,
    "source": "ollive-sdk-js"
  },
  "metadata": {
    "tenant_id": "local"
  }
}
```

## Non-Goals For Milestone 1

- No database migration for `agent_runs` yet.
- No new public collector endpoint yet.
- No JS or Python SDK yet.
- No LangSmith or OpenTelemetry adapter yet.
- No AI-based risk analyzer yet.

Milestone 1 only creates the contract that those features will implement.
