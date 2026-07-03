# Adapter Strategy

Ollive should be independent of every observability vendor.

LangSmith, OpenTelemetry, Vercel observability, custom logs, and native SDKs are
inputs. Ollive's differentiated output is risk interpretation: authority,
auditability, accountability, failure nodes, and evidence packets.

## Adapter Contract

Every adapter should normalize into `AgentRun`:

```text
source trace/span/callback
  -> source payload record
  -> AgentRun
  -> AgentRunStep[]
  -> evidence packet
```

Required adapter output:

- `agent.name`
- `task.input`
- `outcome.status`
- ordered `steps`
- source metadata

Recommended adapter output:

- authority scope
- tool calls and tool results
- retrieval/source evidence
- human handoff or approval events
- external side effects
- redaction status

## LangSmith Mapping

LangSmith can feed Ollive, but Ollive should not require LangSmith.

Suggested mapping:

| LangSmith concept | Ollive field |
| --- | --- |
| project/session | `metadata.project`, `task.thread_id` |
| run id | `source_id`, `metadata.langsmith_run_id` |
| root run | `AgentRun` |
| child LLM run | `steps[type=model_call]` |
| tool run | `steps[type=tool_call]` |
| retriever run | `steps[type=retrieval]` |
| error | `steps[].error`, `outcome.status=failed` |
| tags/metadata | `metadata` |

Authority is not usually present in generic tracing tools. If missing, Ollive
should surface that as missing evidence instead of assuming the run is safe.

## OpenTelemetry Mapping

OpenTelemetry should map spans into ordered steps:

| OTel concept | Ollive field |
| --- | --- |
| trace id | `source_id`, `metadata.otel_trace_id` |
| root span | `AgentRun` |
| span id | `steps[].evidence_ref` |
| span name | `steps[].name` |
| span kind/client call | `tool_call` or `external_action` |
| events | `runtime_event` |
| status/error | `steps[].status`, `steps[].error` |
| attributes | `steps[].input`, `steps[].output`, `metadata` |

For agent workflows, prefer semantic step types over generic span labels when
possible.

## Custom Logs

Custom logs should use `/v1/runs` directly when possible. This avoids a heavy
adapter and keeps the source application in control of what evidence is stored.

Use the JavaScript SDK for TypeScript/Node agent backends. Use JSON ingest for
other runtimes until a first-party SDK exists.

## Adapter Sanity Checks

An adapter is useful when:

- a risky side effect can be traced to a step
- missing authority is visible
- tool output is linked to the model claim it supports
- a human handoff is explicit
- the exported packet can explain the finding without opening the source tool
