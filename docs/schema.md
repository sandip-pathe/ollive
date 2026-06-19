# Schema Notes

The schema lives in `packages/database/schema.sql` and is applied to Postgres.

## Core Tables

- `users` - local user records plus `llm_call_count`.
- `conversations` - one chat thread per user or actor.
- `messages` - user, assistant, and system messages.
- `traces` - one model run with runtime, cost, token, status, and payload evidence.
- `trace_events` - ordered lifecycle events for each trace.
- `inference_logs` - SDK-friendly log records for ingestion and enrichment.
- `extracted_metadata` - queryable key/value metadata extracted from inference logs.
- `memories` - optional future memory layer.

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

## Indexing Notes

The schema indexes conversation timelines, trace status, provider/model, event type, inference log trace IDs, risk event trace IDs, risk category, risk status, and the unique evidence packet per trace.

Before high-volume production use, add time-based partitioning for `traces`, `trace_events`, `inference_logs`, and `agent_risk_events`.
