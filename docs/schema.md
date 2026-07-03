# Schema Notes

The schema lives in `packages/database/schema.sql` and is applied to Postgres.

Milestone 1 defines `AgentRun` as the canonical future product object, but the
database still persists the current chat-as-agent MVP through traces, trace
events, inference logs, risk events, and evidence packets. No `agent_runs`
table has been added yet.

## Core Tables

- `users` - local user records plus `llm_call_count`.
- `conversations` - one chat thread per user or actor.
- `messages` - user, assistant, and system messages.
- `traces` - one model run with runtime, cost, token, status, and payload evidence.
- `trace_events` - ordered lifecycle events for each trace.
- `inference_logs` - SDK-friendly log records for ingestion and enrichment.
- `extracted_metadata` - queryable key/value metadata extracted from inference logs.
- `memories` - optional future memory layer.

## AgentRun Contract

`AgentRun` is the normalized shape that future SDKs, adapters, JSON ingest, and
the built-in chat integration should feed.

Current schema mapping:

| Current table | AgentRun role |
| --- | --- |
| `conversations` | task thread/session context |
| `messages` | user input and assistant output evidence |
| `traces` | source run/model-call evidence |
| `trace_events` | runtime event steps |
| `inference_logs` | SDK-style model-call evidence |
| `extracted_metadata` | derived evidence metadata |
| `agent_risk_events` | generated run findings |
| `evidence_packets` | generated packet wrapper |

See [AgentRun schema](./architecture/agent-run-schema.md) for the target
contract.

## Agentic Insurance Tables

### `agent_policy_rules`

Stores the active policy pack and rule metadata. The API currently seeds `agentic_insurance_v1` on startup.

Important fields:

- `policy_pack`
- `rule_key`
- `title`
- `description`
- `risk_category`
- `default_severity`
- `default_owner`
- `match_strategy`

### `agent_risk_events`

Stores classifier findings for one trace.

Important fields:

- `trace_id`
- `conversation_id`
- `message_id`
- `policy_rule_id`
- `risk_category`
- `status`
- `severity`
- `confidence`
- `owner`
- `title`
- `reason`
- `evidence_quote`
- `evidence_source`
- `remediation`
- `classifier_version`

### `evidence_packets`

Stores the packet wrapper that the inspect UI renders.

Important fields:

- `trace_id`
- `conversation_id`
- `status`
- `insurability_posture`
- `summary`
- `packet_json`
- `created_at`
- `updated_at`

`packet_json` currently stores failure nodes and audit trail metadata. Risk events stay normalized in `agent_risk_events` so they can be queried by category, severity, owner, and status.

In the target architecture, evidence packets should be run-level packets. Until
the `agent_runs` table exists, packets are generated from trace evidence and the
schema should continue to expose missing evidence clearly.

## Indexing Notes

The schema indexes conversation timelines, trace status, provider/model, event type, inference log trace IDs, risk event trace IDs, risk category, risk status, and the unique evidence packet per trace.

Before high-volume production use, add time-based partitioning for `traces`, `trace_events`, `inference_logs`, and `agent_risk_events`.

## Future Tables

Expected future tables after Milestone 2 or later:

- `agent_runs` - canonical run record with agent, task, authority, outcome, and metadata.
- `agent_run_steps` - ordered normalized steps such as model calls, tool calls, handoffs, and runtime events.
- `agent_run_sources` - raw source linkage to traces, OpenTelemetry spans, LangSmith runs, or JSON ingest.
- `agent_authority_scopes` - reusable authority policies for allowed/disallowed actions and required handoff.

These are intentionally not created in Milestone 1. The goal of Milestone 1 is to
settle the contract before writing migrations.
