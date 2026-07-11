from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4


def _json(value: Any, default: Any = None) -> str:
    if value is None:
        value = default
    return json.dumps(value, default=str)


def loads_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list, int, float, bool)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row) if row else {}


def new_run_id(prefix: str = "run") -> str:
    return f"{prefix}_{uuid4().hex}"


def as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str)
    except TypeError:
        return str(value)


async def ensure_agent_run_schema(pool) -> None:
    async with pool.acquire() as conn:
        await ensure_agent_run_schema_conn(conn)


async def ensure_agent_run_schema_conn(conn) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_runs (
          run_id TEXT PRIMARY KEY,
          trace_id UUID REFERENCES traces(trace_id) ON DELETE SET NULL,
          conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
          tenant_id TEXT NOT NULL DEFAULT 'local',
          source TEXT NOT NULL DEFAULT 'json',
          agent_name TEXT NOT NULL,
          agent_version TEXT,
          environment TEXT,
          task_type TEXT,
          task_input JSONB NOT NULL DEFAULT 'null',
          context JSONB NOT NULL DEFAULT '{}',
          authority JSONB NOT NULL DEFAULT '{}',
          outcome_status TEXT NOT NULL DEFAULT 'unknown',
          outcome JSONB NOT NULL DEFAULT '{}',
          evidence JSONB NOT NULL DEFAULT '{}',
          metadata JSONB NOT NULL DEFAULT '{}',
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_agent_runs_trace_id ON agent_runs(trace_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation_id ON agent_runs(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_outcome_status ON agent_runs(outcome_status);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at DESC);

        CREATE TABLE IF NOT EXISTS agent_run_steps (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
          step_id TEXT,
          type TEXT NOT NULL,
          timestamp TIMESTAMPTZ,
          name TEXT,
          status TEXT NOT NULL DEFAULT 'unknown',
          input JSONB NOT NULL DEFAULT '{}',
          output JSONB NOT NULL DEFAULT '{}',
          error JSONB,
          evidence_ref TEXT,
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_agent_run_steps_run_order ON agent_run_steps(run_id, order_index);
        CREATE INDEX IF NOT EXISTS idx_agent_run_steps_type ON agent_run_steps(type);
        DO $$
        BEGIN
          IF to_regclass('idx_agent_run_steps_run_step_id') IS NULL THEN
            DELETE FROM agent_run_steps
            WHERE id IN (
              SELECT id
              FROM (
                SELECT
                  id,
                  ROW_NUMBER() OVER (
                    PARTITION BY run_id, step_id
                    ORDER BY created_at DESC, id DESC
                  ) AS duplicate_number
                FROM agent_run_steps
                WHERE step_id IS NOT NULL
              ) duplicates
              WHERE duplicate_number > 1
            );
          END IF;
        END $$;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_run_steps_run_step_id
          ON agent_run_steps(run_id, step_id)
          WHERE step_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS agent_run_sources (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
          source_type TEXT NOT NULL,
          source_id TEXT,
          payload JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_agent_run_sources_run_id ON agent_run_sources(run_id);
        CREATE INDEX IF NOT EXISTS idx_agent_run_sources_source ON agent_run_sources(source_type, source_id);
        """
    )


async def upsert_agent_run(conn, payload: dict[str, Any], *, source: str = "json") -> str:
    await ensure_agent_run_schema_conn(conn)
    run_id = str(payload.get("run_id") or new_run_id())
    agent = payload.get("agent") or {}
    task = payload.get("task") or {}
    outcome = payload.get("outcome") or {}
    evidence = payload.get("evidence") or {}
    metadata = payload.get("metadata") or {}
    authority = payload.get("authority") or {}
    context = payload.get("context") or {}
    steps = payload.get("steps") or []
    trace_id = payload.get("trace_id")
    conversation_id = payload.get("conversation_id")

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO agent_runs (
              run_id, trace_id, conversation_id, tenant_id, source, agent_name,
              agent_version, environment, task_type, task_input, context,
              authority, outcome_status, outcome, evidence, metadata,
              started_at, completed_at
            ) VALUES (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,
              $12,$13,$14,$15,$16,
              $17,$18
            )
            ON CONFLICT (run_id) DO UPDATE SET
              trace_id=EXCLUDED.trace_id,
              conversation_id=EXCLUDED.conversation_id,
              tenant_id=EXCLUDED.tenant_id,
              source=EXCLUDED.source,
              agent_name=EXCLUDED.agent_name,
              agent_version=EXCLUDED.agent_version,
              environment=EXCLUDED.environment,
              task_type=EXCLUDED.task_type,
              task_input=EXCLUDED.task_input,
              context=EXCLUDED.context,
              authority=EXCLUDED.authority,
              outcome_status=EXCLUDED.outcome_status,
              outcome=EXCLUDED.outcome,
              evidence=EXCLUDED.evidence,
              metadata=EXCLUDED.metadata,
              started_at=EXCLUDED.started_at,
              completed_at=EXCLUDED.completed_at,
              updated_at=now()
            """,
            run_id,
            UUID(str(trace_id)) if trace_id else None,
            UUID(str(conversation_id)) if conversation_id else None,
            str(payload.get("tenant_id") or metadata.get("tenant_id") or "local"),
            str(source or payload.get("source") or "json"),
            str(agent.get("name") or "unknown-agent"),
            agent.get("version"),
            agent.get("environment"),
            task.get("type"),
            _json(task.get("input"), None),
            _json(context, {}),
            _json(authority, {}),
            str(outcome.get("status") or "unknown"),
            _json(outcome, {}),
            _json(evidence, {}),
            _json(metadata, {}),
            payload.get("started_at"),
            payload.get("completed_at"),
        )
        await conn.execute("DELETE FROM agent_run_steps WHERE run_id=$1", run_id)
        await insert_agent_run_steps(conn, run_id, steps)
        await record_agent_run_source(conn, run_id, source, payload.get("source_id"), payload)
    return run_id


async def insert_agent_run_steps(conn, run_id: str, steps: list[dict[str, Any]]) -> None:
    await ensure_agent_run_schema_conn(conn)
    current = await conn.fetchval("SELECT COALESCE(MAX(order_index), -1) FROM agent_run_steps WHERE run_id=$1", run_id)
    start = int(current) + 1 if current is not None else 0
    for offset, step in enumerate(steps):
        await conn.execute(
            """
            INSERT INTO agent_run_steps (
              run_id, step_id, type, timestamp, name, status,
              input, output, error, evidence_ref, order_index
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (run_id, step_id) WHERE step_id IS NOT NULL DO UPDATE SET
              type=EXCLUDED.type,
              timestamp=EXCLUDED.timestamp,
              name=EXCLUDED.name,
              status=EXCLUDED.status,
              input=EXCLUDED.input,
              output=EXCLUDED.output,
              error=EXCLUDED.error,
              evidence_ref=EXCLUDED.evidence_ref
            """,
            run_id,
            step.get("step_id"),
            str(step.get("type") or "runtime_event"),
            step.get("timestamp"),
            step.get("name"),
            str(step.get("status") or "unknown"),
            _json(step.get("input"), {}),
            _json(step.get("output"), {}),
            _json(step.get("error"), None) if step.get("error") is not None else None,
            step.get("evidence_ref"),
            start + offset,
        )
    await conn.execute("UPDATE agent_runs SET updated_at=now() WHERE run_id=$1", run_id)


async def record_agent_run_source(conn, run_id: str, source_type: str, source_id: str | None, payload: Any) -> None:
    await conn.execute(
        """
        INSERT INTO agent_run_sources (run_id, source_type, source_id, payload)
        VALUES ($1,$2,$3,$4)
        """,
        run_id,
        source_type,
        source_id,
        _json(payload, {}),
    )


async def fetch_agent_run(conn, run_id: str) -> dict[str, Any] | None:
    await ensure_agent_run_schema_conn(conn)
    run = await conn.fetchrow("SELECT * FROM agent_runs WHERE run_id=$1", run_id)
    if not run:
        return None
    steps = await conn.fetch(
        "SELECT * FROM agent_run_steps WHERE run_id=$1 ORDER BY order_index ASC, created_at ASC",
        run_id,
    )
    sources = await conn.fetch(
        "SELECT source_type, source_id, created_at FROM agent_run_sources WHERE run_id=$1 ORDER BY created_at DESC LIMIT 20",
        run_id,
    )
    payload = row_to_dict(run)
    for key in ("task_input", "context", "authority", "outcome", "evidence", "metadata"):
        payload[key] = loads_json(payload.get(key))
    payload["steps"] = []
    for row in steps:
        step = row_to_dict(row)
        for key in ("input", "output", "error"):
            step[key] = loads_json(step.get(key))
        payload["steps"].append(step)
    payload["sources"] = [row_to_dict(row) for row in sources]
    return payload


async def list_agent_runs(conn, *, limit: int = 100) -> list[dict[str, Any]]:
    await ensure_agent_run_schema_conn(conn)
    rows = await conn.fetch(
        """
        SELECT
          ar.*,
          COUNT(ars.id) AS steps_count,
          ep.status AS packet_status,
          ep.insurability_posture,
          ep.summary AS packet_summary
        FROM agent_runs ar
        LEFT JOIN agent_run_steps ars ON ars.run_id = ar.run_id
        LEFT JOIN evidence_packets ep ON ep.run_id = ar.run_id
        GROUP BY ar.run_id, ep.status, ep.insurability_posture, ep.summary
        ORDER BY ar.created_at DESC
        LIMIT $1
        """,
        max(1, min(limit, 250)),
    )
    results = []
    for row in rows:
        payload = row_to_dict(row)
        for key in ("task_input", "context", "authority", "outcome", "evidence", "metadata"):
            payload[key] = loads_json(payload.get(key))
        results.append(payload)
    return results


async def upsert_agent_run_from_trace(conn, trace: dict[str, Any], events: list[dict[str, Any]]) -> str:
    trace_id = trace.get("trace_id")
    run_id = f"trace_{trace_id}"
    task_input = trace.get("raw_request_json") or trace.get("user_preview") or {}
    if isinstance(task_input, str):
        task_input = loads_json(task_input)
    output_text = trace.get("assistant_preview") or ""
    model_input = trace.get("raw_request_json") or {"user_preview": trace.get("user_preview")}
    model_output = trace.get("raw_response_json") or {"text": output_text}
    if isinstance(model_input, str):
        model_input = loads_json(model_input)
    if isinstance(model_output, str):
        model_output = loads_json(model_output)
    steps: list[dict[str, Any]] = [
        {
            "step_id": f"{trace_id}:user",
            "type": "user_message",
            "timestamp": _ms_to_datetime(trace.get("started_at")),
            "status": "success",
            "input": trace.get("user_preview") or model_input,
            "evidence_ref": f"trace:{trace_id}:user_preview",
        },
        {
            "step_id": f"{trace_id}:model",
            "type": "model_call",
            "timestamp": _ms_to_datetime(trace.get("started_at")),
            "name": "chat_response",
            "status": trace.get("status") or "unknown",
            "input": model_input or {},
            "output": model_output or {},
            "evidence_ref": f"trace:{trace_id}:model_call",
        },
    ]
    for event in events:
        payload = event.get("payload")
        steps.append(
            {
                "step_id": str(event.get("id") or f"{trace_id}:{event.get('type')}"),
                "type": str(event.get("type") or "runtime_event"),
                "timestamp": _ms_to_datetime(event.get("timestamp")),
                "status": "success",
                "input": {},
                "output": loads_json(payload) or {},
                "evidence_ref": f"trace_event:{event.get('id')}",
            }
        )

    payload = {
        "run_id": run_id,
        "trace_id": str(trace_id),
        "conversation_id": str(trace.get("conversation_id")) if trace.get("conversation_id") else None,
        "source_id": str(trace_id),
        "started_at": _ms_to_datetime(trace.get("started_at")),
        "completed_at": _ms_to_datetime(trace.get("completed_at")),
        "agent": {
            "name": "ollive-chat-agent",
            "version": str(trace.get("model") or "unknown"),
            "environment": "local",
        },
        "task": {
            "type": "chat",
            "input": task_input,
            "thread_id": str(trace.get("conversation_id")) if trace.get("conversation_id") else None,
        },
        "context": {
            "message_count": trace.get("message_count"),
            "context_length": trace.get("context_length"),
        },
        "authority": {
            "scope": "informational_support",
            "requires_handoff": ["coverage_decision", "regulated_advice", "binding_commitment"],
            "disallowed_actions": ["approve_claim", "deny_claim", "guarantee_payout"],
        },
        "steps": steps,
        "outcome": {
            "status": trace.get("status") or "unknown",
            "summary": output_text,
            "side_effects": [],
        },
        "evidence": {
            "redaction_applied": True,
            "redaction_scope": "packet_previews_only",
            "pii_detected": bool(trace.get("pii_detected")),
            "source": "ollive-chat-trace",
        },
        "metadata": {
            "provider": trace.get("provider"),
            "model": trace.get("model"),
            "latency_ms": trace.get("latency_ms"),
            "total_tokens": trace.get("total_tokens"),
            "estimated_cost_usd": str(trace.get("estimated_cost_usd")) if trace.get("estimated_cost_usd") is not None else None,
        },
    }
    return await upsert_agent_run(conn, payload, source="chat_trace")


def _ms_to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc)
    except Exception:
        return None
