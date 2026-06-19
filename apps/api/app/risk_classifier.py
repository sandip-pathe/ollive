from __future__ import annotations

import asyncio
import json
import re
from decimal import Decimal
from typing import Any
from uuid import UUID

from . import db

POLICY_PACK = "agentic_insurance_v1"
CLASSIFIER_VERSION = "risk-classifier-v1"
RISK_PACKET_QUEUE = "risk_packet_queue"

RULES = [
    {
        "rule_key": "promise_guarantee",
        "title": "Risky promise detected",
        "description": "Agent committed the company or customer to a definite outcome.",
        "risk_category": "risky_promise",
        "default_severity": "high",
        "default_owner": "Support",
        "match_strategy": "hybrid",
    },
    {
        "rule_key": "coverage_advice",
        "title": "Coverage or regulated advice detected",
        "description": "Agent discussed coverage, claims, policy terms, or regulated-adjacent guidance.",
        "risk_category": "coverage_or_regulated_advice",
        "default_severity": "high",
        "default_owner": "Legal/Compliance",
        "match_strategy": "hybrid",
    },
    {
        "rule_key": "pii_detected",
        "title": "Sensitive data entered the trace path",
        "description": "Trace was flagged by redaction checks.",
        "risk_category": "pii_exposure",
        "default_severity": "high",
        "default_owner": "Engineering",
        "match_strategy": "deterministic",
    },
    {
        "rule_key": "handoff_missing",
        "title": "Required escalation appears missing",
        "description": "Regulated or coverage-adjacent interaction did not include a handoff/review signal.",
        "risk_category": "missed_escalation",
        "default_severity": "medium",
        "default_owner": "Support",
        "match_strategy": "hybrid",
    },
    {
        "rule_key": "unsupported_claim",
        "title": "Unsupported claim detected",
        "description": "Agent stated an approval, denial, eligibility, or coverage outcome without source/tool evidence.",
        "risk_category": "unsupported_claim",
        "default_severity": "medium",
        "default_owner": "Founder",
        "match_strategy": "llm",
    },
    {
        "rule_key": "unsafe_action",
        "title": "Unsafe action suggestion detected",
        "description": "Agent suggested an action that could create business, legal, or customer harm.",
        "risk_category": "unsafe_action_suggestion",
        "default_severity": "high",
        "default_owner": "Legal/Compliance",
        "match_strategy": "llm",
    },
    {
        "rule_key": "runtime_failure_node",
        "title": "Workflow failure node detected",
        "description": "Runtime evidence shows a failed or incomplete workflow state.",
        "risk_category": "workflow_failure_node",
        "default_severity": "medium",
        "default_owner": "Engineering",
        "match_strategy": "deterministic",
    },
    {
        "rule_key": "authority_breach",
        "title": "Authority boundary breach detected",
        "description": "Agent acted beyond informational support by approving, denying, refunding, or guaranteeing.",
        "risk_category": "authority_boundary_breach",
        "default_severity": "critical",
        "default_owner": "Legal/Compliance",
        "match_strategy": "hybrid",
    },
]

PROMISE_TERMS = [
    "guarantee",
    "definitely",
    "will be reimbursed",
    "will be refunded",
    "covered for sure",
    "we promise",
]
COVERAGE_TERMS = [
    "covered",
    "coverage",
    "policy covers",
    "claim will",
    "denied",
    "approved",
    "premium",
    "deductible",
    "rider",
    "exclusion",
]
AUTHORITY_TERMS = [
    "approved",
    "denied",
    "will be reimbursed",
    "will be refunded",
    "guarantee",
    "covered for sure",
    "will be covered",
]
UNSAFE_PATTERNS = [
    r"\bcancel\b.{0,40}\bpolicy\b",
    r"\bwithhold\b.{0,40}\binformation\b",
    r"\bdon't mention\b",
    r"\bdo not mention\b",
    r"\breapply tomorrow\b",
]
ESCALATION_EVENTS = {"human_handoff", "escalation", "review_required"}
TERMINAL_EVENTS = {"stream_completed", "cancelled", "timeout", "error"}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str)
    except TypeError:
        return str(value)


def _loads_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row) if row else {}


def _contains_any(text: str, terms: list[str]) -> str | None:
    lowered = text.lower()
    for term in terms:
        if term in lowered:
            return term
    return None


def _matches_any_pattern(text: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return pattern
    return None


def _evidence_quote(text: str, marker: str | None, fallback: str) -> str:
    source = text.strip() or fallback.strip()
    if not source:
        return ""
    if not marker:
        return source[:240]
    index = source.lower().find(marker.lower())
    if index < 0:
        return source[:240]
    start = max(0, index - 80)
    end = min(len(source), index + len(marker) + 120)
    return source[start:end].strip()


def _event_payload_text(events: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for event in events:
        parts.append(str(event.get("type", "")))
        parts.append(_as_text(_loads_json(event.get("payload"))))
    return "\n".join(parts)


def _confidence(value: float, status: str) -> tuple[float, str]:
    if value < 0.65 and status == "risk_detected":
        return value, "needs_review"
    return value, status


def _risk_event(
    *,
    rule_key: str,
    title: str,
    reason: str,
    evidence_quote: str,
    evidence_source: str,
    remediation: str,
    confidence: float,
    status: str = "risk_detected",
    severity: str | None = None,
    owner: str | None = None,
) -> dict[str, Any]:
    rule = next(rule for rule in RULES if rule["rule_key"] == rule_key)
    confidence, status = _confidence(confidence, status)
    return {
        "policy_pack": POLICY_PACK,
        "policy_rule_key": rule_key,
        "risk_category": rule["risk_category"],
        "status": status,
        "severity": severity or rule["default_severity"],
        "confidence": confidence,
        "owner": owner or rule["default_owner"],
        "title": title,
        "reason": reason,
        "evidence_quote": evidence_quote[:500] if evidence_quote else None,
        "evidence_source": evidence_source,
        "remediation": remediation,
        "classifier_version": CLASSIFIER_VERSION,
    }


def _terminal_posture(trace: dict[str, Any], risk_events: list[dict[str, Any]], packet_status: str) -> str:
    if packet_status != "ready":
        return "unknown"
    for event in risk_events:
        if event["severity"] == "critical" and event["status"] in {"risk_detected", "blocked"}:
            return "blocked"
        if event["risk_category"] == "authority_boundary_breach" and event["status"] == "risk_detected":
            return "blocked"
    if any(event["status"] == "needs_review" for event in risk_events):
        return "needs_review"
    if any(
        event["severity"] in {"medium", "high"} and event["status"] == "risk_detected"
        for event in risk_events
    ):
        return "needs_review"
    if trace.get("status") == "success":
        return "insurable"
    return "unknown"


def _failure_nodes(trace: dict[str, Any], events: list[dict[str, Any]], risk_events: list[dict[str, Any]]) -> list[dict[str, str]]:
    nodes: list[dict[str, str]] = []
    event_types = {str(event.get("type")) for event in events}
    status = str(trace.get("status") or "queued")
    if status in {"error", "timeout", "cancelled"}:
        nodes.append({"type": "terminal_runtime_state", "owner": "Engineering", "evidence": f"Trace ended with status {status}."})
    if not events:
        nodes.append({"type": "missing_trace_events", "owner": "Engineering", "evidence": "No trace events were captured for this run."})
    elif not (event_types & TERMINAL_EVENTS):
        nodes.append({"type": "missing_terminal_event", "owner": "Engineering", "evidence": "Trace has runtime events but no terminal event."})
    if any(event["risk_category"] in {"coverage_or_regulated_advice", "unsupported_claim"} for event in risk_events):
        has_tool_evidence = bool(event_types & {"tool_call", "tool_result", "retrieval", "source"})
        if not has_tool_evidence:
            nodes.append({"type": "missing_policy_context", "owner": "Engineering", "evidence": "No retrieval/tool event provided policy evidence."})
    if any(event["risk_category"] == "missed_escalation" for event in risk_events):
        nodes.append({"type": "missing_escalation", "owner": "Support", "evidence": "Risky interaction did not include a human handoff signal."})
    return nodes


def _packet_summary(posture: str, risk_events: list[dict[str, Any]], failure_nodes: list[dict[str, str]]) -> str:
    if posture == "insurable":
        return "No material agentic insurance risk detected in this run."
    if posture == "blocked":
        return "Run is blocked for insurability until critical authority or liability risk is remediated."
    if posture == "needs_review":
        top = risk_events[0]["title"] if risk_events else "Risk evidence needs review"
        return f"{top}. Review evidence, owner, and remediation before treating this run as insurable."
    if failure_nodes:
        return "Evidence packet could not establish insurability because workflow evidence is incomplete."
    return "Evidence packet is pending or unavailable for this run."


async def ensure_risk_schema(pool) -> None:
    async with pool.acquire() as conn:
        await _ensure_risk_schema_conn(conn)


async def _ensure_risk_schema_conn(conn) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_policy_rules (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          policy_pack TEXT NOT NULL,
          rule_key TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          risk_category TEXT NOT NULL,
          default_severity TEXT NOT NULL,
          default_owner TEXT NOT NULL,
          match_strategy TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(policy_pack, rule_key)
        );
        CREATE TABLE IF NOT EXISTS agent_risk_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          trace_id UUID NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
          conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
          message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
          policy_rule_id UUID REFERENCES agent_policy_rules(id) ON DELETE SET NULL,
          policy_pack TEXT NOT NULL,
          risk_category TEXT NOT NULL,
          status TEXT NOT NULL,
          severity TEXT NOT NULL,
          confidence NUMERIC(5, 4) NOT NULL,
          owner TEXT NOT NULL,
          title TEXT NOT NULL,
          reason TEXT NOT NULL,
          evidence_quote TEXT,
          evidence_source TEXT NOT NULL,
          remediation TEXT NOT NULL,
          classifier_version TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_agent_risk_events_trace_id ON agent_risk_events(trace_id);
        CREATE INDEX IF NOT EXISTS idx_agent_risk_events_category ON agent_risk_events(risk_category);
        CREATE INDEX IF NOT EXISTS idx_agent_risk_events_status ON agent_risk_events(status);
        CREATE TABLE IF NOT EXISTS evidence_packets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          trace_id UUID NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
          conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          insurability_posture TEXT NOT NULL,
          summary TEXT NOT NULL,
          packet_json JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_packets_trace_id ON evidence_packets(trace_id);
        """
    )
    for rule in RULES:
        await conn.execute(
            """
            INSERT INTO agent_policy_rules (
              policy_pack, rule_key, title, description, risk_category,
              default_severity, default_owner, match_strategy
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (policy_pack, rule_key) DO UPDATE SET
              title=EXCLUDED.title,
              description=EXCLUDED.description,
              risk_category=EXCLUDED.risk_category,
              default_severity=EXCLUDED.default_severity,
              default_owner=EXCLUDED.default_owner,
              match_strategy=EXCLUDED.match_strategy
            """,
            POLICY_PACK,
            rule["rule_key"],
            rule["title"],
            rule["description"],
            rule["risk_category"],
            rule["default_severity"],
            rule["default_owner"],
            rule["match_strategy"],
        )


async def mark_evidence_packet_pending(conn, trace_id: UUID) -> None:
    await _ensure_risk_schema_conn(conn)
    trace = await conn.fetchrow("SELECT trace_id, conversation_id FROM traces WHERE trace_id=$1", trace_id)
    if not trace:
        return
    await conn.execute(
        """
        INSERT INTO evidence_packets (
          trace_id, conversation_id, status, insurability_posture, summary, packet_json
        ) VALUES ($1,$2,'pending','unknown','Evidence packet generation is pending.',$3)
        ON CONFLICT (trace_id) DO UPDATE SET
          status='pending',
          insurability_posture='unknown',
          summary='Evidence packet generation is pending.',
          updated_at=now()
        """,
        trace_id,
        trace["conversation_id"],
        json.dumps({"policy_pack": POLICY_PACK, "classifier_version": CLASSIFIER_VERSION}),
    )


def classify_trace(trace: dict[str, Any], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    user_text = _as_text(trace.get("user_preview"))
    assistant_text = _as_text(trace.get("assistant_preview"))
    event_text = _event_payload_text(events)
    corpus = "\n".join([user_text, assistant_text, event_text])
    event_types = {str(event.get("type")) for event in events}
    risk_events: list[dict[str, Any]] = []

    promise_marker = _contains_any(assistant_text, PROMISE_TERMS)
    coverage_marker = _contains_any(assistant_text, COVERAGE_TERMS)
    user_coverage_marker = _contains_any(user_text, COVERAGE_TERMS)
    authority_marker = _contains_any(assistant_text, AUTHORITY_TERMS)
    unsafe_marker = _matches_any_pattern(assistant_text, UNSAFE_PATTERNS)

    if promise_marker:
        risk_events.append(
            _risk_event(
                rule_key="promise_guarantee",
                title="Risky promise detected",
                reason="The assistant used commitment language that may create a customer-facing obligation.",
                evidence_quote=_evidence_quote(assistant_text, promise_marker, corpus),
                evidence_source="assistant_message",
                remediation="Require non-binding language or human approval before promises about reimbursement, refunds, approvals, or coverage.",
                confidence=0.9,
            )
        )

    if coverage_marker:
        risk_events.append(
            _risk_event(
                rule_key="coverage_advice",
                title="Coverage or regulated advice detected",
                reason="The assistant discussed coverage, claims, policy terms, or regulated-adjacent guidance without proving authority.",
                evidence_quote=_evidence_quote(assistant_text, coverage_marker, corpus),
                evidence_source="assistant_message",
                remediation="Require policy context retrieval and licensed/human review before coverage guidance.",
                confidence=0.82,
            )
        )
    elif user_coverage_marker:
        risk_events.append(
            _risk_event(
                rule_key="coverage_advice",
                title="Coverage question needs review",
                reason="The user asked for coverage or policy guidance, so the agent response should be reviewed for authority boundaries.",
                evidence_quote=_evidence_quote(user_text, user_coverage_marker, corpus),
                evidence_source="user_message",
                remediation="Route coverage-related questions through a policy-aware workflow or human review.",
                confidence=0.6,
            )
        )

    if trace.get("pii_detected"):
        risk_events.append(
            _risk_event(
                rule_key="pii_detected",
                title="Sensitive data entered the trace path",
                reason="The trace was flagged by redaction checks, which is a trust and auditability concern.",
                evidence_quote="PII flag was true on the trace.",
                evidence_source="runtime",
                remediation="Show redaction category and avoid storing raw sensitive payloads in evidence packets.",
                confidence=0.95,
            )
        )

    if (coverage_marker or user_coverage_marker or promise_marker) and not (event_types & ESCALATION_EVENTS):
        risk_events.append(
            _risk_event(
                rule_key="handoff_missing",
                title="Required escalation appears missing",
                reason="Coverage or promise risk appeared without a human handoff, escalation, or review-required event.",
                evidence_quote="No human_handoff, escalation, or review_required trace event was found.",
                evidence_source="trace_event",
                remediation="Emit a review_required or human_handoff event for regulated, coverage, or commitment-bearing interactions.",
                confidence=0.72,
            )
        )

    has_tool_evidence = bool(event_types & {"tool_call", "tool_result", "retrieval", "source"})
    if (coverage_marker or authority_marker) and not has_tool_evidence:
        risk_events.append(
            _risk_event(
                rule_key="unsupported_claim",
                title="Unsupported claim detected",
                reason="The assistant asserted coverage, approval, denial, or eligibility without source/tool evidence in the trace.",
                evidence_quote=_evidence_quote(assistant_text, coverage_marker or authority_marker, corpus),
                evidence_source="assistant_message",
                remediation="Attach source policy/tool evidence to the run before treating the answer as reliable.",
                confidence=0.7,
            )
        )

    if unsafe_marker:
        risk_events.append(
            _risk_event(
                rule_key="unsafe_action",
                title="Unsafe action suggestion detected",
                reason="The assistant suggested an action that may create business, legal, or customer harm.",
                evidence_quote=_evidence_quote(assistant_text, None, assistant_text),
                evidence_source="assistant_message",
                remediation="Block or escalate unsafe action recommendations before they reach customers.",
                confidence=0.82,
            )
        )

    if authority_marker:
        risk_events.append(
            _risk_event(
                rule_key="authority_breach",
                title="Authority boundary breach detected",
                reason="The assistant appeared to approve, deny, refund, reimburse, guarantee, or bind coverage beyond informational support.",
                evidence_quote=_evidence_quote(assistant_text, authority_marker, corpus),
                evidence_source="assistant_message",
                remediation="Constrain the agent to informational support and require human approval for binding decisions.",
                confidence=0.88,
            )
        )

    status = str(trace.get("status") or "queued")
    missing_terminal = bool(events) and not (event_types & TERMINAL_EVENTS)
    if status in {"error", "timeout", "cancelled"} or not events or missing_terminal or not assistant_text:
        reason = "Runtime evidence shows a failed or incomplete workflow state."
        if status in {"error", "timeout", "cancelled"}:
            reason = f"Trace ended with status {status}."
        elif not events:
            reason = "No runtime events were captured for this trace."
        elif missing_terminal:
            reason = "Trace events are missing a terminal event."
        elif not assistant_text:
            reason = "Trace is missing assistant response evidence."
        risk_events.append(
            _risk_event(
                rule_key="runtime_failure_node",
                title="Workflow failure node detected",
                reason=reason,
                evidence_quote=reason,
                evidence_source="runtime",
                remediation="Complete the trace lifecycle and record terminal state before trusting this run.",
                confidence=0.9,
            )
        )

    return risk_events


async def generate_evidence_packet(conn, trace_id: UUID) -> dict[str, Any]:
    await _ensure_risk_schema_conn(conn)
    trace_row = await conn.fetchrow("SELECT * FROM traces WHERE trace_id=$1", trace_id)
    if not trace_row:
        raise ValueError("Trace not found")
    trace = _row_to_dict(trace_row)
    events = [
        _row_to_dict(row)
        for row in await conn.fetch(
            "SELECT id, trace_id, type, timestamp, duration_ms, payload FROM trace_events WHERE trace_id=$1 ORDER BY timestamp ASC",
            trace_id,
        )
    ]
    for event in events:
        event["payload"] = _loads_json(event.get("payload"))

    risk_events = classify_trace(trace, events)
    failure_nodes = _failure_nodes(trace, events, risk_events)
    posture = _terminal_posture(trace, risk_events, "ready")
    summary = _packet_summary(posture, risk_events, failure_nodes)
    packet_json = {
        "failure_nodes": failure_nodes,
        "audit_trail": {
            "policy_pack": POLICY_PACK,
            "classifier_version": CLASSIFIER_VERSION,
            "source_trace_events": len(events),
            "redacted": True,
            "llm_classifier": "not_used",
        },
    }

    async with conn.transaction():
        await conn.execute("DELETE FROM agent_risk_events WHERE trace_id=$1", trace_id)
        rule_rows = await conn.fetch("SELECT id, rule_key FROM agent_policy_rules WHERE policy_pack=$1", POLICY_PACK)
        rule_ids = {row["rule_key"]: row["id"] for row in rule_rows}
        for event in risk_events:
            await conn.execute(
                """
                INSERT INTO agent_risk_events (
                  trace_id, conversation_id, message_id, policy_rule_id,
                  policy_pack, risk_category, status, severity, confidence,
                  owner, title, reason, evidence_quote, evidence_source,
                  remediation, classifier_version
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
                """,
                trace_id,
                trace.get("conversation_id"),
                trace.get("message_id"),
                rule_ids.get(event["policy_rule_key"]),
                POLICY_PACK,
                event["risk_category"],
                event["status"],
                event["severity"],
                Decimal(str(event["confidence"])),
                event["owner"],
                event["title"],
                event["reason"],
                event["evidence_quote"],
                event["evidence_source"],
                event["remediation"],
                event["classifier_version"],
            )
        await conn.execute(
            """
            INSERT INTO evidence_packets (
              trace_id, conversation_id, status, insurability_posture, summary, packet_json
            ) VALUES ($1,$2,'ready',$3,$4,$5)
            ON CONFLICT (trace_id) DO UPDATE SET
              status='ready',
              insurability_posture=EXCLUDED.insurability_posture,
              summary=EXCLUDED.summary,
              packet_json=EXCLUDED.packet_json,
              updated_at=now()
            """,
            trace_id,
            trace.get("conversation_id"),
            posture,
            summary,
            json.dumps(packet_json),
        )

    return await get_evidence_packet(conn, trace_id)


async def mark_evidence_packet_error(conn, trace_id: UUID, message: str) -> None:
    await _ensure_risk_schema_conn(conn)
    trace = await conn.fetchrow("SELECT trace_id, conversation_id FROM traces WHERE trace_id=$1", trace_id)
    if not trace:
        return
    await conn.execute(
        """
        INSERT INTO evidence_packets (
          trace_id, conversation_id, status, insurability_posture, summary, packet_json
        ) VALUES ($1,$2,'error','unknown',$3,$4)
        ON CONFLICT (trace_id) DO UPDATE SET
          status='error',
          insurability_posture='unknown',
          summary=EXCLUDED.summary,
          packet_json=EXCLUDED.packet_json,
          updated_at=now()
        """,
        trace_id,
        trace["conversation_id"],
        message[:500],
        json.dumps({"error": message[:500], "policy_pack": POLICY_PACK, "classifier_version": CLASSIFIER_VERSION}),
    )


async def generate_evidence_packet_background(trace_id: UUID) -> None:
    if db.pool is None:
        return
    async with db.pool.acquire() as conn:
        try:
            await generate_evidence_packet(conn, trace_id)
        except Exception as exc:
            await mark_evidence_packet_error(conn, trace_id, f"Evidence packet generation failed: {exc}")


def schedule_evidence_packet(trace_id: UUID) -> None:
    try:
        asyncio.create_task(generate_evidence_packet_background(trace_id))
    except RuntimeError:
        pass


async def get_evidence_packet(conn, trace_id: UUID) -> dict[str, Any]:
    await _ensure_risk_schema_conn(conn)
    packet = await conn.fetchrow(
        """
        SELECT id, trace_id, conversation_id, status, insurability_posture,
               summary, packet_json, created_at, updated_at
        FROM evidence_packets
        WHERE trace_id=$1
        """,
        trace_id,
    )
    if not packet:
        trace = await conn.fetchrow("SELECT trace_id, conversation_id FROM traces WHERE trace_id=$1", trace_id)
        if not trace:
            raise ValueError("Trace not found")
        await mark_evidence_packet_pending(conn, trace_id)
        packet = await conn.fetchrow(
            """
            SELECT id, trace_id, conversation_id, status, insurability_posture,
                   summary, packet_json, created_at, updated_at
            FROM evidence_packets
            WHERE trace_id=$1
            """,
            trace_id,
        )
        schedule_evidence_packet(trace_id)

    risk_rows = await conn.fetch(
        """
        SELECT id, trace_id, risk_category, status, severity, confidence, owner,
               title, reason, evidence_quote, evidence_source, remediation,
               classifier_version, created_at
        FROM agent_risk_events
        WHERE trace_id=$1
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END,
          confidence DESC,
          created_at ASC
        """,
        trace_id,
    )

    packet_dict = _row_to_dict(packet)
    packet_json = _loads_json(packet_dict.get("packet_json")) or {}
    risk_events = []
    for row in risk_rows:
        event = _row_to_dict(row)
        event["confidence"] = float(event["confidence"]) if event.get("confidence") is not None else 0
        risk_events.append(event)

    audit_trail = packet_json.get("audit_trail") if isinstance(packet_json, dict) else None
    failure_nodes = packet_json.get("failure_nodes") if isinstance(packet_json, dict) else None
    return {
        "packet": packet_dict,
        "risk_events": risk_events,
        "failure_nodes": failure_nodes or [],
        "audit_trail": audit_trail
        or {
            "policy_pack": POLICY_PACK,
            "classifier_version": CLASSIFIER_VERSION,
            "source_trace_events": 0,
            "redacted": True,
        },
    }
